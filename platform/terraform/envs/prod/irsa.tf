data "aws_iam_policy_document" "sqs_send" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.payments.arn]
  }
}

data "aws_iam_policy_document" "sqs_consume" {
  statement {
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.payments.arn]
  }
}

data "aws_iam_policy_document" "sqs_read_attrs" {
  statement {
    actions   = ["sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.payments.arn]
  }
}

resource "aws_iam_policy" "sqs_send" {
  name   = "seat-booking-sqs-send"
  policy = data.aws_iam_policy_document.sqs_send.json
}

resource "aws_iam_policy" "sqs_consume" {
  name   = "seat-booking-sqs-consume"
  policy = data.aws_iam_policy_document.sqs_consume.json
}

resource "aws_iam_policy" "sqs_read_attrs" {
  name   = "seat-booking-sqs-read-attrs"
  policy = data.aws_iam_policy_document.sqs_read_attrs.json
}

module "booking_bff_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name        = "seat-booking-bff-sqs"
  role_policy_arns = { policy = aws_iam_policy.sqs_send.arn }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["booking:booking-bff"]
    }
  }
}

module "payment_worker_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name        = "seat-booking-payment-worker-sqs"
  role_policy_arns = { policy = aws_iam_policy.sqs_consume.arn }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["booking:payment-worker"]
    }
  }
}

module "keda_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name        = "seat-booking-keda-sqs-reader"
  role_policy_arns = { policy = aws_iam_policy.sqs_read_attrs.arn }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["keda:keda-operator"]
    }
  }
}
