import { Helmet } from "react-helmet-async";

interface Props {
  title: string;
  description?: string;
  canonicalPath?: string;
}

export default function SEO({ title, description, canonicalPath }: Props) {
  const fullTitle = `${title} | PR&S Unit Platform`;
  const url = canonicalPath
    ? `${window.location.origin}${canonicalPath}`
    : window.location.href;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
    </Helmet>
  );
}
