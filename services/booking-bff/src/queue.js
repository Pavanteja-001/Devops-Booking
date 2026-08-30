import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const isLocal = Boolean(process.env.QUEUE_ENDPOINT);

const client = new SQSClient({
  region: process.env.AWS_REGION ?? "ap-south-1",
  ...(isLocal && {
    endpoint: process.env.QUEUE_ENDPOINT,
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  }),
});

const QUEUE_URL = process.env.QUEUE_URL;

export async function enqueuePayment(message) {
  await client.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
    })
  );
}
