# Demo video script — record in this order

Total target: ~5-6 minutes. Have two terminal windows ready (one for
`kubectl`/commands, one for `watch`/logs) plus a browser tab on the app and
one on Grafana. Do a dry run of each command once before hitting record so
you're not typing live.

---

## 0. Before you hit record

```bash
export AWS_PROFILE=terraform-admin
LB=$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo $LB   # note this down, you'll paste it into the browser
```

Open in browser tabs:
- `http://$LB` — the app
- Grafana: get URL/password with the commands in section 5

---

## 1. Architecture (0:00–0:30)

Show the architecture diagram from `readme.md`. One sentence:
> "Two structurally different workloads — synchronous request/response and
> event-driven async — flow through the same golden path with no platform
> changes."

---

## 2. The app working (0:30–1:00)

In the browser: log in, pick a show, select seats, book. Show the seat grid
update live (that's the WebSocket / seatmap service). Mention: booking
creates a hold in Redis, the BFF writes its own booking row, enqueues to
real SQS, and a separate payment worker confirms it a few seconds later —
watch the status flip from `pending_payment` to `confirmed` in "My Bookings".

---

## 3. Kyverno — policy rejection (1:00–1:45)

```bash
kubectl -n booking run bad-pod --image=nginx:latest --restart=Never
```

Point out the admission webhook denial message on screen — three separate
rule violations (root, `:latest` tag, missing probes), rejected **before**
the pod ever runs. Clean up:

```bash
kubectl -n booking delete pod bad-pod --ignore-not-found=true
```

---

## 4. Canary auto-rollback — the headline demo (1:45–3:30)

This is scripted through git, not a manual kubectl command — that's the point.

**Before recording this segment**, start traffic in a background terminal
(let it run silently, don't show this part):
```bash
LB=$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
for i in $(seq 1 900); do curl -s -o /dev/null "http://$LB/bff/shows"; sleep 0.2; done &
```

**On camera:**
1. Show `platform/apps/workloads/booking-bff.yaml` — point at the values
   files it tracks.
2. Add the line referencing `values-booking-bff-canary.yaml`, commit, push.
   Say out loud: "this values file sets a 15% induced error rate — I'm
   simulating a broken v2 deploy."
3. Force Argo CD to notice immediately (skips the 3-min poll wait, just for
   the recording):
   ```bash
   kubectl -n argocd annotate application root argocd.argoproj.io/refresh=hard --overwrite
   ```
4. Switch to `kubectl argo rollouts get rollout booking-bff -n booking --watch`
   — show it step to 10% weight, the AnalysisRun start, and either show the
   Grafana error-rate panel ticking up, or just narrate over the terminal.
5. Show the abort message when it fires: `RolloutAborted: ... assessed
   Failed due to failed (2) > failureLimit (1)`.
6. Confirm zero impact: `curl http://$LB/bff/shows` still returns 200 the
   whole time — stable never lost traffic.

**Revert after recording** (don't leave the chaos trigger live):
```bash
git revert HEAD --no-edit && git push
kubectl -n argocd annotate application root argocd.argoproj.io/refresh=hard --overwrite
```

---

## 5. KEDA scale-to-zero (3:30–4:15)

```bash
kubectl -n booking get pods -l app=payment-worker   # show: no pods, scaled to zero
```

Send a burst directly to the real SQS queue (grab the URL from Terraform
output first: `terraform output sqs_queue_url`):
```bash
python3 -c "
import boto3, json
sqs = boto3.client('sqs', region_name='ap-south-1')
for i in range(60):
    sqs.send_message(QueueUrl='<queue-url>', MessageBody=json.dumps({'bookingId': 999000+i, 'showId':'s1','holdId':'demo','seats':['Z1']}))
print('sent 60 messages')
"
watch kubectl -n booking get pods -l app=payment-worker
```
Show it scale 0→N, then purge the queue and show it drain back to 0:
```bash
python3 -c "
import boto3
boto3.client('sqs', region_name='ap-south-1').purge_queue(QueueUrl='<queue-url>')
"
```

---

## 6. Argo CD self-heal (4:15–4:45)

```bash
kubectl -n booking scale deploy/inventory --replicas=0
kubectl -n booking get deploy inventory --watch
```
Show replicas come back to 2 on their own within moments — no one ran
`kubectl apply`. Optionally show the Argo CD UI's sync history at the same
moment.

---

## 7. Grafana / observability (4:45–5:15)

```bash
kubectl -n monitoring get secret kube-prometheus-stack-grafana -o jsonpath='{.data.admin-password}' | base64 -d
kubectl -n monitoring patch svc kube-prometheus-stack-grafana -p '{"spec":{"type":"LoadBalancer"}}'
kubectl -n monitoring get svc kube-prometheus-stack-grafana   # wait for EXTERNAL-IP
```
Open Grafana, show the RED metrics dashboard for `booking-bff` — point out
the error-rate spike from the canary demo is still visible in the graph if
you recorded within the same retention window.

---

## 8. Wrap-up (5:15–5:45)

One line each on: why five services not a monolith, why single NAT, why
in-cluster Postgres/Redis instead of RDS/ElastiCache for this demo (cost).
Point at the GitHub repo.

---

## 9. AFTER recording — teardown immediately

```bash
./platform/terraform/teardown.sh
```
Then double check in the AWS console (Billing, EC2, EKS, VPC) that nothing
is left running.
