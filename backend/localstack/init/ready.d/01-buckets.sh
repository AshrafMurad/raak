#!/bin/sh
# LocalStack ready-hook: create the private dev bucket (idempotent).
awslocal s3 mb s3://raak-private || echo "bucket raak-private already exists"
