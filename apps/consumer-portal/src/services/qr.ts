import QRCode from 'qrcode';

export interface SvgQrOptions {
  /** Size margin in QR module blocks (default: 2) */
  margin?: number;
  /** Primary dark module color (default: '#0f172a' deep slate) */
  darkColor?: string;
  /** Background light color (default: '#ffffff' pure white) */
  lightColor?: string;
  /** Error correction level: L (7%), M (15%), Q (25%), H (30%) */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Accessible title for screen readers */
  title?: string;
}

/**
 * Generates an inline Vector SVG string for a given payload (e.g. UPI URI)
 * entirely offline without making any network calls or external Google API requests.
 *
 * @param content The URI or text to encode into the QR code
 * @param options Styling and error correction configuration
 * @returns Pure inline <svg>...</svg> string with viewBox
 */
export async function generateInlineVectorSvgQr(
  content: string,
  options: SvgQrOptions = {}
): Promise<string> {
  const {
    margin = 2,
    darkColor = '#0f172a',
    lightColor = '#ffffff',
    errorCorrectionLevel = 'M',
    title = 'UPI QR Code'
  } = options;

  const rawSvg = await QRCode.toString(content, {
    type: 'svg',
    margin,
    errorCorrectionLevel,
    color: {
      dark: darkColor,
      light: lightColor,
    },
    width: 280,
  });

  // Inject semantic accessibility attributes and responsive vector scaling
  const accessibleSvg = rawSvg
    .replace('<svg ', `<svg role="img" aria-label="${title}" class="upi-vector-qr" `)
    .replace('>', `><title>${title}</title>`);

  return accessibleSvg;
}
