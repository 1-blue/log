"use client";

import { useState, useEffect } from "react";

import { makeQueries } from "#/libs";

interface IURLMetadata {
  title: string;
  description: string;
  image: string;
  siteName: string;
}

interface IProps {
  href: string;
}

const LinkPreviewCard: React.FC<IProps> = ({ href }) => {
  const [metadata, setMetadata] = useState<IURLMetadata | null>(null);
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
      <div className="bg-base-300 bg-accent relative flex max-w-3xl gap-2 overflow-hidden rounded-lg shadow-xl">
        <figure className="aspect-[16/12] w-[150px] flex-shrink-0 overflow-hidden sm:w-[200px]">
          <img
            src={metadata.image}
            alt={metadata.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </figure>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h5 className="line-clamp-1 text-lg font-semibold">
            {metadata.title}
          </h5>
          <span className="after:from-primary after:to-secondary relative inline-block w-fit text-xs after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-gradient-to-r after:transition-all group-hover:after:w-full">
            📮 {hostname} 📮
          </span>
          <p className="line-clamp-2 text-sm sm:line-clamp-3">
            {metadata.description}
          </p>
          <span className="mt-auto text-end text-xs">
            - {metadata.siteName} -
          </span>
        </div>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
