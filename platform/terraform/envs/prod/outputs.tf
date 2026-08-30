output "vpc_id" {
  value = module.vpc.vpc_id
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "ecr_repository_urls" {
  value = { for k, v in aws_ecr_repository.service : k => v.repository_url }
}

output "sqs_queue_url" {
  value = aws_sqs_queue.payments.url
}

output "booking_bff_irsa_role_arn" {
  value = module.booking_bff_irsa.iam_role_arn
}

output "payment_worker_irsa_role_arn" {
  value = module.payment_worker_irsa.iam_role_arn
}

output "keda_irsa_role_arn" {
  value = module.keda_irsa.iam_role_arn
}
