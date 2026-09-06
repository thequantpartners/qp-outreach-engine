declare module 'qrcode-terminal' {
  interface QROptions {
    small?: boolean;
  }
  export function generate(input: string, options?: QROptions, callback?: (qrcode: string) => void): void;
}
