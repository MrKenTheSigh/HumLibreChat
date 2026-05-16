import { EToolResources, inferMimeType } from 'librechat-data-provider';

export const AUTO_CONTEXT_UPLOAD_RESOURCE = '__auto_context_upload__';

export function isOllamaGemmaUploadTarget({
  endpoint,
  endpointType,
  provider,
  model,
}: {
  endpoint?: string | null;
  endpointType?: string | null;
  provider?: string | null;
  model?: string | null;
}) {
  const normalizedEndpoint = endpoint?.toLowerCase() ?? '';
  const normalizedEndpointType = endpointType?.toLowerCase() ?? '';
  const normalizedProvider = provider?.toLowerCase() ?? '';
  const normalizedModel = model?.toLowerCase() ?? '';

  return (
    normalizedEndpoint === 'ollama' ||
    normalizedEndpointType === 'ollama' ||
    normalizedProvider === 'ollama' ||
    normalizedModel.includes('gemma')
  );
}

export function getAutoUploadToolResource(file: File): EToolResources | undefined {
  const mimeType = inferMimeType(file.name, file.type);
  if (mimeType.startsWith('image/')) {
    return undefined;
  }

  return EToolResources.context;
}
