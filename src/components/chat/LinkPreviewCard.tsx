import { useLinkPreview } from "@/hooks/useLinkPreview";

export function LinkPreviewCard({ url }: { url: string }) {
  const { data } = useLinkPreview(url);
  if (!data) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-1.5 max-w-[360px] text-left rounded-lg border border-borderbg-secondary/60 hover:bg-secondary overflow-hidden"
    >
      <div className="p-2.5">
        <p className="text-[10px] text-muted-foreground truncate">
          {data.siteName}
        </p>
        {data.title && (
          <p className="text-xs font-semibold text-primary mt-0.5 line-clamp-2 break-words">
            {data.title}
          </p>
        )}
        {data.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 break-words">
            {data.description}
          </p>
        )}
      </div>
      {data.image && (
        <img
          src={data.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.display = "none")}
          className="w-full max-h-[200px] object-cover"
        />
      )}
    </a>
  );
}
