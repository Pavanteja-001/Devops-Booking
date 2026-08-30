terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "seat-booking-tfstate-402631154447"
    key            = "prod/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "seat-booking-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}
