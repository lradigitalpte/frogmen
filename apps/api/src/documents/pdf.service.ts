import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { existsSync } from "node:fs";

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  private resolveChromeExecutable(): string {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const candidates = [
      process.platform === "win32"
        ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        : null,
      process.platform === "win32"
        ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
        : null,
      process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : null,
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const puppeteer = require("puppeteer") as typeof import("puppeteer");
      const bundled = puppeteer.executablePath();
      if (existsSync(bundled)) {
        return bundled;
      }
    } catch {
      // Fall through to the error below.
    }

    throw new InternalServerErrorException(
      "PDF generation is unavailable: no Chrome/Chromium executable found. Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.",
    );
  }

  async renderHtmlToPdf(html: string): Promise<Buffer> {
    const executablePath = this.resolveChromeExecutable();

    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "12mm",
            right: "12mm",
            bottom: "12mm",
            left: "12mm",
          },
        });
        return Buffer.from(pdf);
      } finally {
        await browser.close();
      }
    } catch (error) {
      this.logger.error(
        `PDF generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      throw new InternalServerErrorException(
        "PDF generation failed. Please try again later.",
      );
    }
  }
}
