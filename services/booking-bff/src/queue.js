import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const client = new SQSClient({
  region: process.env.AWS_REGION ?? "elasticmq",
  endpoint: process.env.QUEUE_ENDPOINT ?? "http://localhost:9324",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const QUEUE_URL = process.env.QUEUE_URL ?? "http://localhost:9324/queue/payments";

export async function enqueuePayment(message) {
  await client.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
    })
  );
}
