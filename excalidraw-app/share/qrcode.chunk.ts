import { encode, renderSVG } from "uqr";

export const generateQRCodeSVG = (text: string): string => {
  return renderSVG(text);
};

export const generateQRCodePNG = (
  text: string,
  pixelsPerModule = 20,
): Promise<Blob> => {
  const { size, data } = encode(text);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * pixelsPerModule;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  data.forEach((row, y) =>
    row.forEach((isDark, x) => {
      if (isDark) {
        ctx.fillRect(
          x * pixelsPerModule,
          y * pixelsPerModule,
          pixelsPerModule,
          pixelsPerModule,
        );
      }
    }),
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("QR code export failed")),
      "image/png",
    ),
  );
};
