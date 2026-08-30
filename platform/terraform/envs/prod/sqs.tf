resource "aws_sqs_queue" "payments" {
  name                       = "payments"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 3600
}
