interface Props {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  isOwn?: boolean;
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreview({ url, title, description, image, isOwn }: Props) {
  const domain = getDomain(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`link-preview ${isOwn ? 'own' : ''}`}
    >
      {image && (
        <div className="link-preview-image">
          <img src={image} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <div className="link-preview-body">
        <span className="link-preview-title">{title || domain}</span>
        {description && <span className="link-preview-desc">{description}</span>}
        <span className="link-preview-domain">{domain}</span>
      </div>
    </a>
  );
}
