/**
 * File reading utilities for document ingestion.
 * Supports .txt, .md, and .pdf files.
 */

import { readFile } from "fs/promises";
import { extname } from "path";
import { PDFParse } from "pdf-parse";

export interface DocumentContent {
  text: string;
  filePath: string;
}

export type SupportedExtension = ".txt" | ".md" | ".pdf";

const SUPPORTED_EXTENSIONS: SupportedExtension[] = [".txt", ".md", ".pdf"];

export function isSupportedFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase() as SupportedExtension;
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export function getSupportedExtensions(): string[] {
  return [...SUPPORTED_EXTENSIONS];
}

/**
 * Read a document file and extract its text content.
 */
export async function readDocument(filePath: string): Promise<DocumentContent> {
  const ext = extname(filePath).toLowerCase() as SupportedExtension;

  switch (ext) {
    case ".txt":
    case ".md":
      return readTextFile(filePath);
    case ".pdf":
      return readPdfFile(filePath);
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
}

async function readTextFile(filePath: string): Promise<DocumentContent> {
  const content = await readFile(filePath, "utf-8");
  return {
    text: content,
    filePath,
  };
}

async function readPdfFile(filePath: string): Promise<DocumentContent> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();
  return {
    text: textResult.text,
    filePath,
  };
}
