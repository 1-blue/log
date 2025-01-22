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

  if (loading) return <div>Loading...</div>;
  if (!metadata) return <div>No metadata</div>;

  const url = new URL(href);
  const hostname = url.hostname;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <div className="card card-side relative max-w-3xl bg-base-300 shadow-xl">
        <figure className="overflow-hidden">
          <img
            src={metadata.image}
            alt={metadata.title}
            className="transition-transform duration-300 group-hover:scale-105"
          />
        </figure>
        <div className="card-body">
          <h2 className="card-title">{metadata.title}</h2>
          <span className="relative inline-block w-fit text-xs after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-gradient-to-r after:from-primary after:to-secondary after:transition-all group-hover:after:w-full">
            📮 {hostname} 📮
          </span>
          <p className="line-clamp-3 text-sm">{metadata.description}</p>
        </div>
        <span className="absolute bottom-3 right-4 text-xs">
          - {metadata.siteName} -
        </span>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
