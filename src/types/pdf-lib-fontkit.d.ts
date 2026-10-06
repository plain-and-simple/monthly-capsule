declare module "@pdf-lib/fontkit" {
  const fontkit: {
    create: (input: Uint8Array | ArrayBuffer) => unknown;
  };
  export default fontkit;
}