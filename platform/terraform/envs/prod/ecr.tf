locals {
  services = ["inventory", "booking-bff", "seatmap", "payment-worker", "settlement", "frontend"]
}

resource "aws_ecr_repository" "service" {
  for_each             = toset(local.services)
  name                 = "seat-booking/${each.value}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}
