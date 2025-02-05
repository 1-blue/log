"use client";

import { useState, useEffect } from "react";

import { makeQueries } from "#/libs";

interface URLMetadata {
  title: string;
  description: string;
  image: string;
  siteName: string;
}

interface IProps {
  href: string;
}

const LinkPreviewCard: React.FC<IProps> = ({ href }) => {
  const [metadata, setMetadata] = useState<URLMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(
          makeQueries("/api/metadata", { url: href }),
        );
        const data = await response.json();
        setMetadata(data);
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [href]);

  if (loading) return <div className="skeleton my-5 h-[150px] w-full" />;
  if (!metadata) return <div>No metadata</div>;

  const url = new URL(href);
  const hostname = url.hostname;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group my-5 block"
    >
      <div className="card card-side relative max-w-3xl bg-base-300 shadow-xl">
        <figure className="w-[150px] flex-shrink-0 overflow-hidden sm:w-[200px]">
          <img
            src={metadata.image}
            alt={metadata.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </figure>
        <div className="card-body">
          <h2 className="card-title line-clamp-1">{metadata.title}</h2>
          <span className="relative inline-block w-fit text-xs after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-gradient-to-r after:from-primary after:to-secondary after:transition-all group-hover:after:w-full">
            📮 {hostname} 📮
          </span>
          <p className="line-clamp-2 text-sm sm:line-clamp-3">
            {metadata.description}
          </p>
        </div>
        <span className="absolute bottom-3 right-4 text-xs">
          - {metadata.siteName} -
        </span>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
