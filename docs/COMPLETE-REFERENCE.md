# Complete System Reference — Seat Booking Platform

This document is the single source of truth for the current live deployment:
every AWS resource, every Kubernetes object, every microservice, the CI/CD
pipeline, and every bug found and fixed while building it. Written so any
reader (human or AI agent) can answer their own questions without needing to
re-derive anything from scratch.

**GitHub repo:** https://github.com/Pavanteja-001/Devops-Booking
**AWS Account ID:** 402631154447
**Region:** ap-south-1 (Mumbai)
**As-of date:** 2026-08-30

---

## 1. High-level architecture

```
Internet
   │
   ▼
AWS Network Load Balancer (auto-provisioned by ingress-nginx Service type=LoadBalancer)
   │
   ▼
ingress-nginx controller (namespace: ingress-nginx)
   ├── path /        → frontend service      (React SPA, static files via nginx)
   ├── path /bff/*    → booking-bff service    (rewrite strips /bff prefix)
   └── path /ws       → seatmap service        (WebSocket, no rewrite — path matches exactly)

booking-bff  → inventory (ClusterIP, internal only, no ingress)
booking-bff  → Postgres (booking_db) — owns its own bookings table
booking-bff  → SQS (real AWS SQS, via IRSA) — enqueues payment jobs
inventory    → Postgres (inventory_db) — owns users, shows
inventory    → Redis — seat locks (TTL) + permanently booked seats (Redis set)
seatmap      → inventory (seat snapshot) + Redis (pub/sub for live updates)
payment-worker → SQS (consumes) → calls booking-bff's internal endpoint to confirm
settlement   → Postgres (booking_db, read+write) — nightly CronJob, no network exposure
```

Two entry paths matter architecturally: payment-worker and settlement have
**no ingress** — one is queue-driven, one is schedule-driven. Everything else
is reachable only from inside the cluster via ClusterIP Services, gated by
NetworkPolicy.

---

## 2. AWS networking

### VPC
- **VPC ID:** `vpc-021b1a774c3500608`
- **CIDR:** `10.0.0.0/16`
- Created by the `terraform-aws-modules/vpc/aws` module (`platform/terraform/envs/prod/vpc.tf`)

### Subnets (3 AZs, public + private)
| Subnet ID | AZ | CIDR | Type |
|---|---|---|---|
| subnet-0efd7bb6ba6692ad5 | ap-south-1a | 10.0.101.0/24 | public |
| subnet-0ad1f2315b9e089f2 | ap-south-1b | 10.0.102.0/24 | public |
| subnet-02e94da45417d75cf | ap-south-1c | 10.0.103.0/24 | public |
| subnet-0bb1858e7b3318d27 | ap-south-1a | 10.0.1.0/24 | private (EKS nodes here) |
| subnet-0364efb59902829f2 | ap-south-1b | 10.0.2.0/24 | private (EKS nodes here) |
| subnet-0e9e00f97342472be | ap-south-1c | 10.0.3.0/24 | private |

### Route tables
| Route Table | Associated with | Routes |
|---|---|---|
| rtb-070dbd89d9f018b08 | 3 public subnets | `10.0.0.0/16 → local`, `0.0.0.0/0 → igw-074a203059739d1b0` |
| rtb-050529619827e885e | 3 private subnets | `10.0.0.0/16 → local`, `0.0.0.0/0 → nat-019ef0515fc79e800` |
| rtb-01c0a1d13a8b28aa4 | (default, unassociated) | `10.0.0.0/16 → local` only |

**Cost-conscious choice:** `single_nat_gateway = true` in `vpc.tf` — one NAT
Gateway (~$0.045/hr + data) shared by all 3 private subnets, instead of one
per AZ. This is a documented trade-off (cost vs. AZ-isolated egress
resilience) — correct for a demo, wrong for production HA.

### Internet Gateway
`igw-074a203059739d1b0`

### NAT Gateway
`nat-019ef0515fc79e800` (single, in one public subnet, used by all private subnets)

### Security Groups
| Group ID | Name | Purpose |
|---|---|---|
| sg-0bcdfe9435deeee9c | eks-cluster-sg-seat-booking-* | EKS control plane ENIs |
| sg-05066a1581b81cb56 | seat-booking-node-* | Worker node traffic |
| sg-09799629c7afa38a2 | seat-booking-cluster-* | Cluster-level shared SG |
| sg-076eb5406a13353e1 | k8s-elb-a74718aeff... | Auto-created for the ingress-nginx/Argo CD NLB |
| sg-06343c057e32f9006 | k8s-elb-a324ee54c3... | Auto-created for the Grafana NLB |
| sg-044bb24349a094d3a | default | VPC default SG, unused |

These `k8s-elb-*` groups are created automatically by the AWS Load Balancer
provisioning whenever a Kubernetes `Service` of `type: LoadBalancer` is
created — one per Service, not managed by Terraform.

---

## 3. EKS Cluster

- **Name:** `seat-booking`
- **Version:** 1.31
- **Endpoint:** `https://81C15D8B092B2F932DF8A78DE0F48210.gr7.ap-south-1.eks.amazonaws.com`
- **OIDC issuer:** `https://oidc.eks.ap-south-1.amazonaws.com/id/81C15D8B092B2F932DF8A78DE0F48210` — this is what every IRSA trust policy references
- **Cluster IAM role:** `seat-booking-cluster-<random-suffix>` (created by the eks module)

### Node group
- **Name:** `default` (Terraform logical name; AWS name is `default-<timestamp-suffix>`)
- **Instance type:** `m7i-flex.large` (2 vCPU, 8GB RAM)
- **AMI type:** AL2023_x86_64_STANDARD (Amazon Linux 2023, x86_64)
- **Scaling:** min 1, max 4, desired 2
- **⚠️ Why `m7i-flex.large` and not `t3.large`:** this AWS account is
  restricted to **Free Tier eligible instance types only** (a trial/learner
  account guardrail). The first `terraform apply` attempt with `t3.large`
  failed with `InvalidParameterCombination - not eligible for Free Tier`.
  Checked eligible types via:
  ```
  aws ec2 describe-instance-types --filters "Name=free-tier-eligible,Values=true"
  ```
  Only `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`, `c7i-flex.large`,
  `m7i-flex.large` were eligible. `m7i-flex.large` was chosen to match the
  RAM headroom originally wanted from `t3.large`, since this same platform
  stack (Argo CD + Rollouts + Kyverno + Prometheus + KEDA + 6 app services)
  had already caused a full Docker Desktop crash once on an 8GB laptop.

### kubectl access
```bash
export AWS_PROFILE=terraform-admin
aws eks update-kubeconfig --name seat-booking --region ap-south-1
```

---

## 4. ECR (container registry)

6 repositories, one per service, all `IMMUTABLE` tag mutability (a real
security choice — prevents tag hijacking, but means a failed push under an
already-used tag must be deleted first, not overwritten):

| Service | Repository URI |
|---|---|
| inventory | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/inventory` |
| booking-bff | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/booking-bff` |
| seatmap | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/seatmap` |
| payment-worker | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/payment-worker` |
| settlement | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/settlement` |
| frontend | `402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/frontend` |

All 6 have `scan_on_push = true` (ECR's own basic scanning, separate from
the Trivy scan in CI).

Manual login (for pushing outside CI):
```bash
export AWS_PROFILE=terraform-admin
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 402631154447.dkr.ecr.ap-south-1.amazonaws.com
```

---

## 5. SQS

- **Queue name:** `payments`
- **URL:** `https://sqs.ap-south-1.amazonaws.com/402631154447/payments`
- **Visibility timeout:** 30s
- **Message retention:** 3600s (1 hour)

This is the **real** queue — local development used ElasticMQ (a local
SQS-compatible emulator) instead; on AWS, `booking-bff` and `payment-worker`
talk to this real queue via IRSA, no static credentials.

---

## 6. IAM & IRSA — how services authenticate to AWS

### IAM User (for Terraform/manual operations)
- **`terraform-admin`** — `arn:aws:iam::402631154447:user/terraform-admin`
  - Has `AdministratorAccess` attached (broad, appropriate for a solo learner
    account doing infra work; would be scoped down in a team setting)
  - Created because the account was originally only accessible via **root**
    credentials, which is unsafe practice — root should never be used for
    day-to-day Terraform runs
  - Used via `export AWS_PROFILE=terraform-admin` for every AWS CLI/Terraform command in this project

### IRSA roles (IAM Role for Service Account) — this is how pods get AWS permissions without static keys

IRSA works by: an EKS OIDC provider is registered in IAM
(`arn:aws:iam::402631154447:oidc-provider/oidc.eks.ap-south-1.amazonaws.com/id/81C15D8B092B2F932DF8A78DE0F48210`),
then an IAM role's trust policy says "I trust tokens from this OIDC provider,
**only** if the token's subject claims to be this exact Kubernetes
ServiceAccount". The pod's ServiceAccount is annotated with
`eks.amazonaws.com/role-arn: <the role>`, and EKS's Pod Identity webhook
automatically injects a projected token + env vars into any pod using that
ServiceAccount. No secrets, no key rotation, ever.

| Role | Trusts (K8s ServiceAccount) | Policy | Purpose |
|---|---|---|---|
| `seat-booking-bff-sqs` | `booking:booking-bff` | `seat-booking-sqs-send` (sqs:SendMessage on the payments queue only) | booking-bff enqueues payment jobs |
| `seat-booking-payment-worker-sqs` | `booking:payment-worker` | `seat-booking-sqs-consume` (ReceiveMessage, DeleteMessage, GetQueueAttributes) | payment-worker's own polling loop |
| `seat-booking-keda-sqs-reader` | `keda:keda-operator` | `seat-booking-sqs-read-attrs` (GetQueueAttributes only) | KEDA's scaler needs to *check* queue depth, not consume messages |

Each policy is scoped to exactly the one action set it needs on exactly the
one queue ARN — least privilege, not a blanket SQS policy.

**Verify a ServiceAccount's IRSA annotation:**
```bash
kubectl -n booking get serviceaccount booking-bff -o yaml | grep role-arn
```

### GitHub Actions OIDC role (for CI, not IRSA — same concept, different identity provider)
- **Role:** `seat-booking-ci` (`arn:aws:iam::402631154447:role/seat-booking-ci`)
- **Trusts:** GitHub's own OIDC provider (`token.actions.githubusercontent.com`), condition scoped to this exact repo
- **Policy:** `seat-booking-ci-ecr-push` — ECR push/pull actions only
- **⚠️ Real bug hit and fixed:** the trust policy's `StringLike` condition
  originally read `repo:Pavanteja-001/Devops-Booking:*`. Every CI run failed
  with `Not authorized to perform sts:AssumeRoleWithWebIdentity` despite the
  policy *looking* correct. Root cause, found via CloudTrail
  (`aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity`):
  GitHub now sends OIDC subject claims in a newer format with numeric IDs
  embedded — `repo:Pavanteja-001@181645082/Devops-Booking@1351429711:ref:refs/heads/main`
  — instead of the classic `repo:owner/repo:ref:...`. Fixed by widening the
  pattern to `repo:Pavanteja-001*/Devops-Booking*:*`. **This is a genuinely
  new/undocumented GitHub behavior at the time this was built — worth
  re-checking if setting this up fresh, since GitHub may have since updated
  their docs to mention it.**

---

## 7. Terraform

### Layout
```
platform/terraform/
├── bootstrap/              # state backend — apply once, rarely touched again
│   ├── main.tf             # S3 bucket + DynamoDB lock table
│   └── variables.tf
├── envs/prod/
│   ├── backend.tf          # points at the bootstrap's S3 bucket
│   ├── vpc.tf
│   ├── eks.tf
│   ├── ecr.tf
│   ├── sqs.tf
│   ├── irsa.tf             # the 3 IRSA roles
│   ├── github-oidc.tf      # GitHub OIDC provider + CI role
│   ├── variables.tf
│   └── outputs.tf
├── gen-aws-values.sh       # reads terraform output, writes Helm values-*-aws.yaml overlays
└── teardown.sh             # ordered teardown script
```

### State backend
- **S3 bucket:** `seat-booking-tfstate-402631154447` (encrypted AES256, versioned, all public access blocked)
- **DynamoDB lock table:** `seat-booking-tflock`
- These are **not** destroyed by `teardown.sh` (they cost pennies/month) —
  only destroyed if you explicitly `cd bootstrap && terraform destroy`

### How to apply (fresh, from zero)
```bash
export AWS_PROFILE=terraform-admin
cd platform/terraform/bootstrap && terraform init && terraform apply -auto-approve
cd ../envs/prod && terraform init && terraform plan -out=tfplan
terraform apply tfplan
```
Takes ~15-20 minutes, almost entirely EKS control plane + node group
provisioning (unavoidable AWS-side wait, not something you can speed up).

### How to tear down
```bash
./platform/terraform/teardown.sh
```
This does, in order: delete any `LoadBalancer`-type Services and PVCs first
(these create real AWS resources — ELBs, EBS volumes — that Terraform
doesn't track and that block VPC deletion if left behind), wait, then
`terraform destroy`. **Never run bare `terraform destroy` first** — it will
hang or leave orphaned ELBs/ENIs.

---

## 8. Kubernetes namespaces and what's in each

| Namespace | Contents |
|---|---|
| `booking` | The application itself: all 6 services, Postgres, Redis |
| `ingress-nginx` | The ingress controller (single shared NLB for all HTTP/WS ingress) |
| `argo-rollouts` | Argo Rollouts controller (2 replicas) |
| `argocd` | Argo CD (server, repo-server, application-controller, redis, dex, notifications, applicationset) |
| `kyverno` | Kyverno admission/background/cleanup/reports controllers |
| `keda` | KEDA operator, metrics-apiserver, admission-webhooks |
| `monitoring` | kube-prometheus-stack: Prometheus, Grafana, Alertmanager, kube-state-metrics, node-exporter, the operator |
| `kube-system` | Standard EKS system pods (coredns, aws-node/VPC CNI, kube-proxy) |

---

## 9. Platform components — what each does and how to reach it

### ingress-nginx
- Single NLB (`type: LoadBalancer` Service) fronts everything
- **Hostname:** `af741d2e36467496f95c6c5eb56622c3-4ad65490ac5dec0b.elb.ap-south-1.amazonaws.com`
- Get it fresh anytime: `kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'`

### Argo CD (GitOps)
- **URL:** `https://a74718aeff9554db3be047dd5980b01c-42622565.ap-south-1.elb.amazonaws.com` (self-signed cert, browser will warn — click through)
- **Username:** `admin`
- **Password:** `5tpNFMvDXcKX87tp` (get fresh anytime: `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`)
- Exposed via `kubectl -n argocd patch svc argocd-server -p '{"spec":{"type":"LoadBalancer"}}'` (starts as ClusterIP by default)
- **App-of-apps pattern:** one `root` Application (`platform/apps/root.yaml`)
  watches `platform/apps/workloads/` in git, which contains one Application
  manifest per service. Each service's Application uses Argo CD's
  **multi-source** feature (`ref: values` + `$values/...` paths) to
  reference the *existing* Helm values files without duplicating content —
  no separate Argo-CD-specific values needed.
- **⚠️ Known operational quirk:** the `argocd-repo-server` aggressively
  caches rendered manifests keyed by resolved git revision. A `hard` refresh
  annotation does **not** reliably force it to notice a change to the
  Application object's *own spec* (e.g., which value files it references) —
  only changes to files *those value files point at*. The reliable fix when
  a change doesn't seem to take effect: `kubectl delete application <name>
  -n argocd --cascade=orphan` (does **not** delete the underlying
  Deployment/Service — `orphan` means exactly "leave the real resources
  alone"), then hard-refresh `root` to have it recreate the Application
  fresh. Hit this exact issue twice: once for seatmap's new Ingress not
  appearing, once for booking-bff/payment-worker's stale hardcoded image tag.

### Argo Rollouts (progressive delivery)
- Runs the canary strategy for `booking-bff` specifically (the only service
  with `canary.enabled: true`)
- CLI: `kubectl argo rollouts get rollout booking-bff -n booking` (plugin
  installed via `brew install argoproj/tap/kubectl-argo-rollouts`)

### Kyverno (policy admission control)
- One `ClusterPolicy` named `workload-baseline` (`platform/policies/workload-baseline.yaml`), three rules, enforced (not just audited) on the `booking` namespace:
  1. `require-limits-and-nonroot` — containers must set resource limits, `runAsNonRoot: true`, `allowPrivilegeEscalation: false` **at the container level specifically** (a pod-level-only setting does NOT satisfy this — caught this exact gap once when a Rollout revision got rejected because only pod-level `securityContext` was set)
  2. `disallow-latest-tag` — no `:latest` image tags
  3. `require-probes` — both `livenessProbe` and `readinessProbe` required (settlement's CronJob-spawned pods are excluded via a label selector, since batch jobs legitimately don't need HTTP probes)
- **This is real enforcement, not just declared** — verified by deliberately
  deploying a non-compliant pod and watching the API server reject it at
  admission with the exact rule violations listed.

### KEDA (event-driven autoscaling)
- Scales `payment-worker`'s Deployment 0→10 replicas based on SQS
  `ApproximateNumberOfMessages` on the `payments` queue (`queueLength: 5`,
  meaning roughly 1 replica per 5 messages waiting)
- Installed with `--set podIdentity.aws.irsa.enabled=true --set
  podIdentity.aws.irsa.roleArn=<seat-booking-keda-sqs-reader ARN>` — the
  KEDA *operator's own* ServiceAccount gets this IRSA role so its scaler
  logic can check queue depth without static AWS creds
- `authMode: irsa` in `values-payment-worker-aws.yaml`'s `keda:` block picks
  this identity path in the Helm chart's `scaledobject.yaml` template
  (versus `authMode: static`, used only for local ElasticMQ testing where
  IRSA isn't available)

### kube-prometheus-stack (Prometheus + Grafana + Alertmanager)
- **Grafana URL:** `http://a324ee54c32c3492b8116ae24632b479-1581851099.ap-south-1.elb.amazonaws.com`
- **Username:** `admin` / **Password:** `admin` (default — not overridden this deployment; get fresh anytime: `kubectl -n monitoring get secret kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' | base64 -d`)
- Exposed via the same LoadBalancer patch pattern as Argo CD
- Prometheus scrapes every HTTP service in `booking` via a `ServiceMonitor`
  the Helm chart creates automatically per-service (`templates/servicemonitor.yaml`)
- **Fed the canary AnalysisTemplate** (see §11) via PromQL queries against these same metrics

---

## 10. Every microservice, in detail

### 10.1 Inventory (Python / Flask)
- **Path:** `services/inventory/`
- **Owns:** Postgres database `inventory_db` (tables: `users`, `shows`) + Redis (seat locks)
- **Does NOT own:** bookings — that's booking-bff's job (see the microservices data-ownership decision in §14)
- **Endpoints:**
  - `GET /healthz`, `GET /readyz` (checks Postgres connectivity; NOT downstream services — see the readiness design decision in §14)
  - `GET /metrics` (Prometheus RED metrics)
  - `POST`/`GET /admin/chaos` (exempt from chaos injection itself; sets `error_rate`, `latency_ms`, `db_pool_exhaust`)
  - `POST /auth/login` — issues JWT (HS256, shared secret `devsecret-change-me` — a real production deployment would source this from a secret manager, not a plaintext env var)
  - `GET /shows`, `GET /shows/<id>/seats`
  - `POST /shows/<id>/hold` (auth required) — Redis `SET NX EX` per seat, 120s TTL
  - `POST /internal/shows/<id>/finalize` (protected by `X-Internal-Token` header, not user JWT) — called by booking-bff after payment confirms; converts a temporary hold into a permanent entry in a Redis Set (`booked:<show_id>`)
- **Image:** `python:3.12-slim` base, multi-stage (`pip install --prefix=/deps` in build stage, `COPY --from=build /deps /usr/local` in final — this specific pattern matters: an earlier attempt used `--target=/deps` + copying only to `site-packages`, which silently dropped the `gunicorn` console script since `--target` doesn't produce a `bin/` dir the way `--prefix` does)
- **Security patch:** `apt-get update && apt-get upgrade -y` added to the final stage after Trivy caught CVE-2026-31789 (OpenSSL heap buffer overflow) in the base image's `libssl3`
- **Runs as:** non-root, UID 10001, via `gunicorn` with 4 workers

### 10.2 Booking BFF (Node.js / Express)
- **Path:** `services/booking-bff/`
- **Owns:** Postgres database `booking_db` (table: `bookings`) — its own database, separate from Inventory's, on the same RDS-less in-cluster Postgres instance
- **The canary target** — this is the *only* service deployed as an Argo
  Rollout instead of a plain Deployment (`canary.enabled: true` in its base values file)
- **Endpoints:**
  - `GET /healthz`, `GET /readyz` (checks its **own** Postgres, per the readiness design decision)
  - `POST /auth/login`, `GET /shows`, `GET /shows/:id/seats` — thin proxies to Inventory (frontend never talks to Inventory directly; matches the architecture diagram, which shows no ingress path to Inventory at all)
  - `POST /book` (auth) — orchestrates: call Inventory's `/hold`, insert its own `bookings` row (`pending_payment`), enqueue an SQS message, return
  - `POST /internal/bookings/:id/complete` (internal token) — called by payment-worker; marks the booking `confirmed`, then calls Inventory's `/internal/.../finalize`
  - `GET /bookings` (auth) — user's own booking history, filtered by JWT subject (object-level authorization — a user cannot read another user's bookings)
- **Chaos:** `chaos.js`'s `error_rate`/`latency_ms` now read from `CHAOS_ERROR_RATE`/`CHAOS_LATENCY_MS` env vars at startup, not just the runtime `/admin/chaos` endpoint — this is what makes the canary-abort demo git-triggerable (see §11)
- **Metrics carry a `version` label** (`stable` or `canary`, from `DEPLOYMENT_TRACK` env var) — this is how the canary AnalysisTemplate's PromQL isolates canary-slice error rate from stable traffic
- **Image:** originally `gcr.io/distroless/nodejs22-debian12` (no shell, no package manager) — **switched to `node:22-slim`** after Trivy found the same OpenSSL CVE and distroless offered no way to patch it in place. Also had **npm itself removed** from the final image (`rm -rf /usr/local/lib/node_modules/npm ...`) after Trivy separately flagged CVE-2026-59873 in `node-tar`, which turned out to be bundled inside npm's *own* `node_modules`, not anything our app depends on — the runtime container never calls `npm` (dependencies are pre-installed in the build stage), so removing it eliminates the vulnerable code entirely rather than trying to patch a package that isn't ours.
- **IRSA:** ServiceAccount `booking-bff` → role `seat-booking-bff-sqs` (SQS SendMessage only)
- **Ingress:** path `/bff(/|$)(.*)`, `pathType: ImplementationSpecific`, with `nginx.ingress.kubernetes.io/rewrite-target: /$2` — strips the `/bff` prefix before it reaches Express (the app's own routes have no such prefix)

### 10.3 Seatmap (Node.js / Express + `ws`)
- **Path:** `services/seatmap/`
- **Owns:** nothing persistent — reads Inventory's seat state, subscribes to Redis pub/sub
- **Endpoint:** `GET /ws` — actually a WebSocket upgrade on path `/ws`. Client
  sends `{"showId": "..."}` as the first message; server replies with a
  `{"type":"snapshot", ...}` full seat grid (fetched live from Inventory),
  then streams `{"type":"update", "seats":[...], "status":"..."}` messages
  as Inventory publishes changes to the `seat-updates:<showId>` Redis channel
- **⚠️ Real bug found and fixed:** had a `NetworkPolicy` allowing ingress
  traffic (`allow-ingress-to-seatmap`) but **no actual `Ingress` object** —
  so despite the policy being correctly configured, `/ws` was completely
  unreachable from outside the cluster and the frontend's live seat updates
  silently never connected. Fixed by adding `ingress.enabled: true, path:
  /ws, pathType: Prefix` to `values-seatmap-aws.yaml` — no rewrite needed
  since the server's own path already matches exactly.
- **Image:** same distroless→`node:22-slim`+npm-removal fix as booking-bff

### 10.4 Payment Worker (Python, async polling loop — no web framework)
- **Path:** `services/payment-worker/`
- **Owns:** nothing persistent — pure consumer
- **No ingress, no Service exposed for traffic** — only `/metrics` via
  `prometheus_client.start_http_server(8080)` (which, notably, responds
  identically on **any** path, not just `/metrics` — this is why its
  liveness/readiness probes can point at `/` and still work)
- **Loop:** `sqs.receive_message` (long-poll, `WaitTimeSeconds=10`) →
  `time.sleep(GATEWAY_DELAY_SECONDS)` (simulated payment gateway latency,
  default 3s) → `POST` to booking-bff's internal complete endpoint →
  `sqs.delete_message` only on success (a failed completion leaves the
  message for automatic SQS redelivery after the visibility timeout)
- **IRSA:** ServiceAccount `payment-worker` → role `seat-booking-payment-worker-sqs`
- **Scaled by KEDA:** `minReplicaCount: 0` — this is the literal "eliminates
  idle worker compute" resume claim, and it's real: confirmed scaling
  0→10→0 against the actual SQS queue

### 10.5 Settlement (Java / Spring Boot, CronJob — not a long-running Deployment)
- **Path:** `services/settlement/`
- **Schedule:** `0 2 * * *` (2 AM daily), `concurrencyPolicy: Forbid`
- **What it does:** `CommandLineRunner` queries `booking_db` for
  `status='confirmed' AND settled_at IS NULL`, sums `seats.length *
  SEAT_PRICE_INR (200)` per show, prints the reconciliation summary, updates
  `settled_at = now()`, then the JVM exits (0 = success) — genuine CronJob
  semantics: run once, exit, don't stay resident
- **The deliberate OOMKill postmortem hook:** if `CHAOS_LEAK=true` is set,
  `simulateLeak()` allocates 10MB byte arrays in a loop until the JVM OOMs
  — this is meant to be demonstrated by *temporarily* removing the
  Dockerfile's `-XX:MaxRAMPercentage=75` flag, which is what actually
  prevents this from being a real problem day-to-day (matches the
  "readiness cascade"-style postmortem structure elsewhere in this project's plan)
- **JDBC array handling fix:** postgres `text[]` columns come back from
  `JdbcTemplate.queryForList` as `java.sql.Array`, not a Java `String[]`
  directly — an earlier version cast unsafely; the current version checks
  `instanceof java.sql.Array` and calls `.getArray()` properly, with a
  fallback to an empty array on any cast failure rather than crashing the
  whole reconciliation run over one malformed row
- **Image:** `eclipse-temurin:21-jre-alpine` — Alpine, not Debian, so it
  needed its own separate CVE patch (`apk update && apk upgrade --no-cache`)
  for the same OpenSSL vulnerability Trivy found across every other service's base image

### 10.6 Frontend (React + Vite, served via nginx)
- **Path:** `frontend/`
- Built with `npm run build` in a `node:20-alpine` stage, served statically
  by `nginxinc/nginx-unprivileged:1.27-alpine` (runs as non-root by design, not something bolted on)
- **⚠️ Real bug found and fixed:** `API_BASE`/`WS_BASE` were hardcoded to
  assume the local `docker-compose` port scheme (frontend:8090 →
  BFF:8082/seatmap:8083 on separate ports, no shared reverse proxy). Under
  the real ingress (one hostname, path-based routing) this made every API
  call and the WebSocket connection try to reach `localhost:8082` from
  inside the *user's own browser* — which obviously isn't the AWS load
  balancer. Fixed to use relative `${window.location.origin}/bff` and a
  protocol-aware relative `/ws` path for anything that isn't local compose.
- **Version badge / canary visibility:** reads the `X-App-Version` response
  header from booking-bff (set from `APP_VERSION` env var, which the Helm
  chart populates from `.Values.image.tag` automatically) — during a real
  canary rollout you'd see this flip between versions as traffic shifts.

---

## 11. The canary rollback mechanism, precisely

This is the single most important demo in the whole project, so here's
exactly how it works end to end:

1. `booking-bff`'s base `values-booking-bff.yaml` sets `canary.enabled:
   true` permanently — this means the Helm chart's `workload.yaml` template
   renders an `argoproj.io/v1alpha1 Rollout` instead of a plain
   `apps/v1 Deployment`, with a `strategy.canary` block: steps
   `10% → pause 1m → 30% → pause 1m → 60% → pause 1m → 100%`, gated by an
   `AnalysisTemplate` starting at step 1.
2. The chart also renders a separate **stable Service** and **canary
   Service** (in addition to the normal one) — Argo Rollouts dynamically
   rewrites their selectors to target only the currently-stable or
   currently-canary ReplicaSet's pods (this is what caused a Helm v4
   server-side-apply conflict once — see §14).
3. The `AnalysisTemplate` (`analysistemplate.yaml`) queries Prometheus:
   ```promql
   (sum(rate(http_requests_total{service="booking-bff",status=~"5..",version="canary"}[2m])) or on() vector(0))
   /
   (sum(rate(http_requests_total{service="booking-bff",version="canary"}[2m])) or on() vector(0))
   ```
   The `or on() vector(0)` guard is load-bearing — without it, a genuinely
   empty result vector (no canary traffic yet) crashes Argo Rollouts'
   expression evaluator with `reflect: slice index out of range` rather
   than being treated as "no data, assume healthy." Found this the hard way
   on the very first live canary test.
   `successCondition: "result[0] < 0.01 or isNaN(result[0])"`,
   `failureLimit: 1` — two consecutive 30-second measurements over the 1%
   error-rate threshold triggers an automatic abort.
4. **To trigger a demo rollout:** `platform/charts/values/values-booking-bff-canary.yaml`
   sets `track: canary` and `env.CHAOS_ERROR_RATE: "0.15"` — a 15% induced
   error rate. This file is **not** part of booking-bff's permanent tracked
   values; it's added *temporarily* to `platform/apps/workloads/booking-bff.yaml`'s
   `valueFiles` list, committed, pushed, and reverted after recording — this
   keeps Argo CD's self-heal from fighting a manual `helm upgrade` (which
   was the original, wrong approach — see §14).
5. Confirmed working twice, identically, on both local `kind` and this real
   EKS cluster: canary steps to 10%, analysis measures the real induced
   error rate, aborts within ~30-60s, rolls back to 100% stable — with
   **zero dropped requests to stable** the entire time (verified by curling
   `/bff/shows` continuously throughout).

---

## 12. CI/CD pipeline, precisely

**File:** `.github/workflows/ci.yaml`

```
push to main
  │
  ▼
static-checks: gitleaks (secret scanning)
  │
  ▼ (matrix: 6 services in parallel)
build:
  1. configure-aws-credentials (OIDC → assumes seat-booking-ci role)
  2. amazon-ecr-login
  3. docker build (tag: git SHA)
  4. Trivy scan — exit-code 1 on any CRITICAL, ignore-unfixed=true (a CVE
     with no available fix wouldn't block the build; one with a fix and we
     just haven't applied it, does)
  5. Syft SBOM generation (spdx-json), uploaded as a build artifact
  6. docker push
  7. cosign sign --yes (keyless — no key ever generated or stored; signs
     using the GitHub Actions OIDC identity itself, verifiable against
     Sigstore's public transparency log forever after)
  8. Promote: sed-replace the tag in platform/charts/values/values-<service>.yaml,
     commit, and push — with a fetch+rebase+retry loop (see §14, this
     specific step failed repeatedly before that fix)
  │
  ▼
Argo CD notices the values file change on its next poll (or a forced
`argocd.argoproj.io/refresh=hard` annotation), auto-syncs, deploys
```

### Verifying a signature manually
```bash
export AWS_PROFILE=terraform-admin
cosign verify \
  --certificate-identity-regexp "https://github.com/Pavanteja-001/Devops-Booking/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  402631154447.dkr.ecr.ap-south-1.amazonaws.com/seat-booking/inventory:<commit-sha>
```
This has been run and confirmed for real — output includes "Existence of
the claims in the transparency log was verified offline" and the exact
certificate subject `https://github.com/Pavanteja-001/Devops-Booking/.github/workflows/ci.yaml@refs/heads/main`.

### GitHub repo secret required
`CI_ROLE_ARN` = `arn:aws:iam::402631154447:role/seat-booking-ci` — set via
`gh secret set CI_ROLE_ARN --body "<arn>" --repo Pavanteja-001/Devops-Booking`

---

## 13. Data layer

### Postgres (in-cluster, not RDS — a deliberate cost trade-off)
- Single Deployment, `postgres:16-alpine`, `emptyDir` volume (no
  persistence across pod restarts — acceptable for a demo, would be an RDS
  instance or a PVC-backed StatefulSet in production)
- **Two databases, two separate app users**, matching microservice data ownership:
  - `inventory_db` — owner `inventory` user — tables `users`, `shows`
  - `booking_db` — owner `booking` user — table `bookings`
- Init script: `platform/manifests/postgres.yaml`'s ConfigMap, mounted at
  `/docker-entrypoint-initdb.d`, runs once on first container start
- **Hardened after Kyverno started enforcing** (see §14): runs as
  non-root UID 999 (Postgres's own default user, not root), explicit
  resource limits, both liveness and readiness probes via `pg_isready`

### Redis (in-cluster)
- Single Deployment, `redis:7-alpine`, no persistence (acceptable — seat
  locks are meant to be ephemeral anyway)
- **Used for two distinct things by Inventory:**
  1. `lock:<showId>:<seatId>` keys, `SET NX EX 120` — temporary seat holds
  2. `booked:<showId>` — a Redis **Set** of permanently booked seats (no
     TTL) — this is what a real booking confirmation adds to via
     `finalize_hold`
  3. `seat-updates:<showId>` — a pub/sub channel Inventory publishes to,
     that Seatmap subscribes to for live updates
- Also hardened for Kyverno the same way as Postgres (non-root UID 999, limits, probes)

### SQS (real AWS, not in-cluster) — see §5

---

## 14. Every real bug found and fixed, in the order encountered

This is the most valuable section for interview prep — none of these were
staged, all were genuinely hit while building this:

1. **`pip install --target` drops console scripts.** Inventory's Dockerfile
   copied `--target=/deps` output straight into `site-packages`, silently
   omitting `gunicorn`'s CLI entry point. Fixed by switching to
   `--prefix=/deps` and copying the whole prefix (`bin/` + `lib/`) into
   `/usr/local`.

2. **Seat-lock check didn't consider permanently booked seats.** The
   original `acquire_seat_lock` only checked the temporary Redis TTL keys,
   not the `booked:<show>` set — meaning a seat that was already sold could
   be re-locked and re-booked. Fixed by checking the booked set first.

3. **8GB local laptop couldn't run the full platform stack concurrently.**
   Docker Desktop crashed outright once under combined kind + Argo CD +
   Argo Rollouts + Kyverno + Prometheus + KEDA + the app. Resolved locally
   by installing/testing one platform component at a time, uninstalling
   after each was proven — and choosing `m7i-flex.large` (8GB RAM) nodes on
   the real EKS cluster specifically to avoid a repeat there.

4. **Kyverno rejected the container's `securityContext.runAsNonRoot`** even
   though it was set — because it was only set at the **pod** level, and
   the policy pattern checks the **container** level specifically. This
   silently broke a Rollout mid-flight once a new revision's ReplicaSet
   tried to create pods after Kyverno was already active.

5. **Helm v4 + Argo Rollouts server-side-apply conflict.** Argo Rollouts'
   controller dynamically manages the `spec.selector` field on the
   stable/canary Services (injecting `rollouts-pod-template-hash`), which
   collided with Helm v4's default server-side-apply field ownership.
   Fixed with `--server-side=false` on the affected `helm upgrade` calls.

6. **Canary PromQL crashed on an empty result vector.** `sum(rate(...))`
   with no matching series (e.g., before any 5xx has ever been recorded)
   returns an *empty* Prometheus result, not `0` — and Argo Rollouts'
   expression evaluator doesn't handle that gracefully
   (`reflect: slice index out of range`). Fixed by wrapping both sides of
   the division in `... or on() vector(0)`.

7. **ARM64 vs x86_64 architecture mismatch.** All local Docker builds on
   this Apple Silicon Mac defaulted to ARM64; EKS nodes run x86_64. Every
   pod failed with `no match for platform in manifest: not found`. Fixed
   with `DOCKER_DEFAULT_PLATFORM=linux/amd64` before every build.

8. **Manually `helm upgrade`-ing a service Argo CD already manages gets
   silently reverted.** Once Argo CD adopts a release with
   `selfHeal: true`, any out-of-band change (a manual `helm upgrade`) gets
   detected as drift and reverted on the next reconciliation. The
   canary chaos trigger had to be redesigned to go through a **git commit**
   to the Application's own tracked value files instead.

9. **Argo CD Applications initially referenced only the base values file**,
   missing the AWS-specific overlay (ECR image repo, IRSA role ARN, real
   SQS URL). Bootstrapping the root app-of-apps briefly reverted the live,
   working AWS deployment back to broken local-only config before this was
   caught and all 6 Application manifests were regenerated to include the
   correct overlay files.

10. **NetworkPolicy is declared but not enforced by default on this EKS
    cluster's VPC CNI.** Verified empirically (an unauthorized test pod
    could still reach Inventory). Attempted fixes: patching
    `ENABLE_NETWORK_POLICY=true` onto the `aws-node` DaemonSet (didn't
    take effect — no `PolicyEndpoint` objects were ever created), then
    attempting to layer in Calico in policy-only mode (failed — the Helm
    chart requires its CRDs pre-installed via a separate step, not bundled
    in one `helm install`). **This remains an open/documented limitation**
    — the NetworkPolicy YAML is correct and was verified to work on `kind`
    (which does enforce it by default), but achieving real enforcement on
    EKS specifically needs either the VPC CNI's network policy feature
    properly enabled via the managed EKS **addon** configuration path (not
    a raw DaemonSet patch), or a fully-installed Calico/Cilium CNI layer —
    neither was completed given time/cost constraints on the trial account.

11. **CI's git-push promotion step raced across 6 parallel matrix jobs.**
    Each service's job independently commits and pushes a values-file tag
    bump; running in parallel, later pushes get rejected as
    non-fast-forward. Fixed with a `fetch + rebase + retry` loop (5
    attempts, small random backoff) instead of a single push attempt.

12. **Trivy caught three separate real CRITICAL CVEs**, not staged:
    - CVE-2026-31789 (OpenSSL heap buffer overflow) in the Debian-based
      images' `libssl3` — fixed with `apt-get upgrade` in the final stage
    - The same CVE in Alpine's `libssl3`/`libcrypto3` (frontend, settlement)
      — fixed with `apk upgrade --no-cache`
    - CVE-2026-59873 (`node-tar` DoS via gzip bomb) — found to be bundled
      inside **npm's own** `node_modules` in the base `node:22-slim` image,
      not anything the app itself depends on. Fixed by removing `npm`
      entirely from the runtime image (never called at runtime anyway).

13. **`booking-bff`/`payment-worker`'s AWS values overlays hardcoded
    `tag: v2`**, silently overriding whatever CI's promote step bumped the
    base file to — meaning CI's automatic image promotion had no real
    effect for exactly these two services, while working correctly for the
    other four. Fixed by removing the hardcoded override so all 6 services
    consistently source their deployed tag from the same place (the base
    values file, which CI bumps).

14. **Seatmap had a NetworkPolicy but no actual Ingress object** — so `/ws`
    was completely unreachable from outside the cluster and the frontend's
    live seat-map updates silently never connected, despite everything
    else appearing to work. Fixed by adding the missing Ingress at path `/ws`.

15. **Frontend's `API_BASE`/`WS_BASE` were hardcoded to the local
    docker-compose port scheme** and broke entirely under the real
    ingress. Fixed to use relative same-origin paths.

16. **Argo CD's `repo-server` caches rendered manifests aggressively** — a
    hard-refresh annotation reliably picks up changes to files an
    Application *already points at*, but not changes to *which files an
    Application points at* (i.e., edits to the Application object's own
    spec, applied by the root app-of-apps). The reliable fix each time:
    delete the specific child Application with `--cascade=orphan` (leaves
    the real K8s resources untouched) and let root recreate it fresh.

17. **CI had no path filter — any push, including a docs-only `.md` edit,
    rebuilt and redeployed all 6 services.** Discovered when pushing this
    very reference document triggered a full pipeline run and gave every
    service the same new image tag. Partially fixed by adding a top-level
    `paths:` filter to `.github/workflows/ci.yaml` (only `services/**`,
    `frontend/**`, `platform/charts/**`, and the workflow file itself
    trigger a run) — this stops *irrelevant* changes (docs, Terraform,
    READMEs) from triggering anything, but does **not** achieve per-service
    selective builds: a change to just `inventory/` still rebuilds all 6.
    A proper fix would use something like `dorny/paths-filter` to compute
    which services actually changed and only include those in the matrix —
    not implemented here, noted as a known improvement.

18. **A price inconsistency existed in the frontend itself, independent of
    any infrastructure work**: `SeatMap.jsx` used `PRICE_PER_SEAT = 15.0`
    while `CheckoutPanel.jsx` used `PRICE_PER_SEAT_USD = 16.0` — the seat
    tooltip and the checkout total silently disagreed on price. Found
    during a completeness audit of this document, not during original
    development. Fixed by aligning both to `16.0`. Worth noting as an
    example of exactly the kind of small inconsistency that's easy to miss
    without a deliberate cross-check pass — which is why this document
    itself went through one after the fact rather than being trusted as
    complete on first write.

---

## 15. Cost and budget

- **AWS Budget:** `seat-booking-project`, $20/month cap, alerts at 50%/90%
  actual spend and 100% forecasted, emailed to sainarayana.spotmies@gmail.com
- **Actual running cost while this stack is up:** roughly $0.30–0.35/hr
  (EKS control plane ~$0.10/hr + 2× m7i-flex.large ~$0.17/hr + NAT Gateway
  ~$0.045/hr + data transfer, ECR/SQS/IAM are effectively free at this scale)
- **This account is restricted to Free Tier EC2 instance types** — see §3.
  This is a real, load-bearing constraint on this specific AWS account, not
  a general AWS limitation — a different (non-trial) account would allow
  any instance type.

---

## 16. Redeploying from zero — realistic time estimate

Since every bug above is now fixed in the committed code, a fresh
`terraform apply` + deploy should take **roughly 35–45 minutes**, almost
entirely EKS's own unavoidable provisioning time:

| Step | Time |
|---|---|
| `terraform apply` (VPC + EKS + ECR + SQS + IRSA + GitHub OIDC) | 15-20 min |
| Install platform stack (ingress-nginx, Argo Rollouts, Kyverno, Prometheus/Grafana, KEDA, Argo CD) | 3-5 min |
| Deploy Postgres/Redis | ~1 min |
| Build + push 6 images to ECR | 5-10 min (longer if Docker's cache is cold) |
| `gen-aws-values.sh` + `helm upgrade` all 6 services | 2-3 min |
| Set `CI_ROLE_ARN` GitHub secret, bootstrap Argo CD (`kubectl apply -f platform/apps/root.yaml`) | ~2 min |
| Verify everything healthy | ~5 min |

Full step-by-step commands: `docs/aws-runbook.md`.

---

## 17. Quick reference — every access point, all in one place

| What | How to reach it |
|---|---|
| The app | `http://af741d2e36467496f95c6c5eb56622c3-4ad65490ac5dec0b.elb.ap-south-1.amazonaws.com` |
| Argo CD | `https://a74718aeff9554db3be047dd5980b01c-42622565.ap-south-1.elb.amazonaws.com` — admin / `5tpNFMvDXcKX87tp` |
| Grafana | `http://a324ee54c32c3492b8116ae24632b479-1581851099.ap-south-1.elb.amazonaws.com` — admin / admin |
| GitHub repo | https://github.com/Pavanteja-001/Devops-Booking |
| GitHub Actions | https://github.com/Pavanteja-001/Devops-Booking/actions |
| kubectl | `aws eks update-kubeconfig --name seat-booking --region ap-south-1` (with `AWS_PROFILE=terraform-admin`) |

**Note on these URLs/credentials:** all of the above are ephemeral —
they belong to Load Balancers and secrets that get destroyed by
`teardown.sh`. After any teardown + redeploy, every URL and the Grafana/Argo CD
passwords will be different; re-fetch them with the commands shown in §9.
