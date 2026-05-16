import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, type Canvas as NapiCanvas } from '@napi-rs/canvas';
import { logger } from '@librechat/data-schemas';
import { deriveBaseURL } from '~/utils';
import type { MistralOCRUploadResult, ServerRequest } from '~/types';

type OCRContext = {
  req: ServerRequest;
  file: Express.Multer.File;
};

type CanvasContext = ReturnType<NapiCanvas['getContext']>;

type CanvasAndContext = {
  canvas: NapiCanvas;
  context: CanvasContext;
};

type OllamaChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const OLLAMA_VISION_OCR_SOURCE = 'ollama_vision_ocr';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_RENDER_SCALE = 2;
const DEFAULT_PAGE_TIMEOUT_MS = 180_000;
const MAX_PAGE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1_000;

type OllamaEndpointConfig = {
  name?: string;
  baseURL?: string;
  ocrMaxPages?: number;
};

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

function getPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getOllamaEndpointConfig(req: ServerRequest): OllamaEndpointConfig | undefined {
  const endpointName = String((req.body as { endpoint?: string })?.endpoint ?? 'ollama')
    .trim()
    .toLowerCase();
  const endpoints = req.config?.endpoints as { custom?: OllamaEndpointConfig[] } | undefined;
  const customEndpoints = endpoints?.custom;

  if (!Array.isArray(customEndpoints)) {
    return undefined;
  }

  return customEndpoints.find((endpoint) => endpoint.name?.trim().toLowerCase() === endpointName);
}

function resolveOllamaBaseURL(req: ServerRequest): string {
  const body = req.body as {
    baseURL?: string;
    reverseProxyUrl?: string;
  };
  const configured =
    getOllamaEndpointConfig(req)?.baseURL ||
    body?.reverseProxyUrl ||
    body?.baseURL ||
    DEFAULT_OLLAMA_BASE_URL;

  return deriveBaseURL(configured);
}

function resolveOllamaMaxPages(req: ServerRequest): number {
  const channelValue = getOllamaEndpointConfig(req)?.ocrMaxPages;
  const bodyValue = (req.body as { ocrMaxPages?: number | string })?.ocrMaxPages;
  return Math.floor(getPositiveNumber(channelValue ?? bodyValue, DEFAULT_MAX_PAGES));
}

function resolveOllamaModel(req: ServerRequest): string {
  const model = (req.body as { model?: string })?.model?.trim();
  if (!model) {
    throw new Error('Ollama vision OCR requires a model name.');
  }
  return model;
}

async function renderPdfPagesToPngFiles(
  file: Express.Multer.File,
  maxPages: number,
): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const renderScale = DEFAULT_RENDER_SCALE;
  const tempDir = path.join(path.dirname(file.path), `${path.basename(file.path)}-ollama-pages`);
  const outputPaths: string[] = [];

  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    const data = new Uint8Array(await fs.promises.readFile(file.path));
    const pdf = await getDocument({ data }).promise;
    const pagesToRender = Math.min(pdf.numPages, maxPages);
    const canvasFactory = new NodeCanvasFactory();

    if (pdf.numPages > maxPages) {
      logger.warn(
        `[uploadOllamaVisionOCR] "${file.originalname}" has ${pdf.numPages} pages; processing first ${maxPages}.`,
      );
    }

    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: renderScale });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;

      const imagePath = path.join(tempDir, `page-${String(pageNumber).padStart(4, '0')}.png`);
      await fs.promises.writeFile(imagePath, canvas.toBuffer('image/png'));
      outputPaths.push(imagePath);
      canvasFactory.destroy({ canvas, context });
    }

    return outputPaths;
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function askOllamaToExtractText({
  baseURL,
  imagePath,
  model,
  pageNumber,
}: {
  baseURL: string;
  imagePath: string;
  model: string;
  pageNumber: number;
}): Promise<string> {
  const imageBase64 = await fs.promises.readFile(imagePath, 'base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_PAGE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    logger.info(
      `[uploadOllamaVisionOCR] Processing page ${pageNumber} with model "${model}" via ${baseURL}.`,
    );
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all readable text from this PDF page image. Preserve reading order, line breaks, lists, and table-like structure when possible. Return only extracted text. If there is no readable text, return an empty response.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Ollama vision OCR failed on page ${pageNumber}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
      );
    }

    const data = (await response.json()) as OllamaChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    logger.info(
      `[uploadOllamaVisionOCR] Page ${pageNumber} completed in ${Date.now() - startedAt}ms with ${text.length} characters.`,
    );
    return text;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error(
        `Ollama vision OCR timed out on page ${pageNumber} after ${DEFAULT_PAGE_TIMEOUT_MS}ms.`,
      );
    }
    throw new Error(
      `Ollama vision OCR request failed on page ${pageNumber}: ${getErrorMessage(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function askOllamaToExtractTextWithRetry({
  baseURL,
  imagePath,
  model,
  pageNumber,
}: {
  baseURL: string;
  imagePath: string;
  model: string;
  pageNumber: number;
}): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt++) {
    try {
      return await askOllamaToExtractText({ baseURL, imagePath, model, pageNumber });
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_PAGE_ATTEMPTS) {
        break;
      }
      logger.warn(
        `[uploadOllamaVisionOCR] Page ${pageNumber} failed on attempt ${attempt}; retrying: ${getErrorMessage(error)}`,
      );
      await delay(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

export async function uploadOllamaVisionOCR({
  req,
  file,
}: OCRContext): Promise<MistralOCRUploadResult> {
  const model = resolveOllamaModel(req);
  const baseURL = resolveOllamaBaseURL(req);
  const maxPages = resolveOllamaMaxPages(req);
  const pagePaths = await renderPdfPagesToPngFiles(file, maxPages);
  const tempDir = pagePaths.length > 0 ? path.dirname(pagePaths[0]) : null;

  try {
    const pages: string[] = [];
    const failedPages: string[] = [];
    for (let index = 0; index < pagePaths.length; index++) {
      const pageNumber = index + 1;
      let pageText = '';
      try {
        pageText = await askOllamaToExtractTextWithRetry({
          baseURL,
          model,
          imagePath: pagePaths[index],
          pageNumber,
        });
      } catch (error) {
        failedPages.push(String(pageNumber));
        logger.error(
          `[uploadOllamaVisionOCR] Page ${pageNumber} failed after ${MAX_PAGE_ATTEMPTS} attempts:`,
          error,
        );
        continue;
      }

      if (pageText.trim()) {
        pages.push(pagePaths.length > 1 ? `# PAGE ${pageNumber}\n${pageText}` : pageText);
      }
    }

    const extractedText = pages.join('\n\n').trim();
    if (!extractedText) {
      throw new Error('No text returned from Ollama vision OCR.');
    }

    const extractionNote =
      failedPages.length > 0
        ? `\n\nOCR note: pages ${failedPages.join(', ')} could not be processed and were omitted.`
        : '';
    const text = `${extractedText}${extractionNote}`.trim();

    return {
      filename: file.originalname,
      bytes: Buffer.byteLength(text, 'utf8'),
      filepath: OLLAMA_VISION_OCR_SOURCE,
      text,
      images: [],
    };
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}
