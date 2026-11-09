import { useEffect, useState } from "react";
import Spinner from "@excalidraw/excalidraw/components/Spinner";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { downloadIcon } from "@excalidraw/excalidraw/components/icons";
import { fileSave } from "@excalidraw/excalidraw/data/filesystem";
import { useI18n } from "@excalidraw/excalidraw/i18n";

interface QRCodeProps {
  value: string;
}

export const QRCode = ({ value }: QRCodeProps) => {
  const { t } = useI18n();
  const [svgData, setSvgData] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    import("./qrcode.chunk")
      .then(({ generateQRCodeSVG }) => {
        if (mounted) {
          try {
            setSvgData(generateQRCodeSVG(value));
          } catch {
            setError(true);
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setError(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [value]);

  if (error) {
    return null;
  }

  if (!svgData) {
    return (
      <div className="ShareDialog__active__qrcode ShareDialog__active__qrcode--loading">
        <Spinner />
      </div>
    );
  }

  const downloadPNG = async () => {
    try {
      const { generateQRCodePNG } = await import("./qrcode.chunk");
      await fileSave(generateQRCodePNG(value), {
        name: "excalidraw-qrcode",
        extension: "png",
        description: "QR code",
      });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error(error);
      }
    }
  };

  return (
    <div className="ShareDialog__active__qrcodeWrapper">
      <div
        className="ShareDialog__active__qrcode"
        role="img"
        aria-label="QR code for collaboration link"
        dangerouslySetInnerHTML={{ __html: svgData }}
      />
      <FilledButton
        size="large"
        variant="outlined"
        label={t("roomDialog.downloadQRCode")}
        icon={downloadIcon}
        onClick={downloadPNG}
      />
    </div>
  );
};
