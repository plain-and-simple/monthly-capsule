declare module "heic-convert" {
  function convert(input: {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<ArrayBuffer>;
  export default convert;
}

declare module "libheif-js/wasm-bundle";

declare module "heic-decode" {
  function decode(input: { buffer: ArrayBuffer | Uint8Array }): Promise<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }>;
  export default decode;
}
