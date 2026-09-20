/**
 * Shared DynamoDB DocumentClient factory.
 *
 * When DYNAMODB_ENDPOINT is set (local dev with DynamoDB Local), the client
 * targets that endpoint with dummy credentials so no real AWS account is needed.
 * When unset, the default AWS SDK provider chain is used (prod / CI).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

let _docClient: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient {
  if (_docClient) return _docClient;

  const region         = config.getValue('awsRegion');
  const dynamoEndpoint = config.getValue('dynamoEndpoint');

  const rawClient = dynamoEndpoint
    ? new DynamoDBClient({
        region,
        endpoint: dynamoEndpoint,
        credentials: {
          accessKeyId:     'local',
          secretAccessKey: 'local',
        },
      })
    : new DynamoDBClient({ region });

  _docClient = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions:   { removeUndefinedValues: true, convertEmptyValues: false },
    unmarshallOptions: { wrapNumbers: false },
  });

  return _docClient;
}

/**
 * Build a one-off DocumentClient against a specific endpoint.
 * Used by the dynamo-init script which runs before the config singleton exists.
 */
export function buildDocClient(opts: {
  region:    string;
  endpoint?: string;
}): DynamoDBDocumentClient {
  const rawClient = opts.endpoint
    ? new DynamoDBClient({
        region:   opts.region,
        endpoint: opts.endpoint,
        credentials: {
          accessKeyId:     'local',
          secretAccessKey: 'local',
        },
      })
    : new DynamoDBClient({ region: opts.region });

  return DynamoDBDocumentClient.from(rawClient, {
    marshallOptions:   { removeUndefinedValues: true, convertEmptyValues: false },
    unmarshallOptions: { wrapNumbers: false },
  });
}
