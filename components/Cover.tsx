"use client";

import Image from "next/image";
import { useState } from "react";
import type { Issue } from "@/lib/content";

export function Cover({ issue, small = false }: { issue: Issue; small?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const remoteImage = /^https:\/\//.test(issue.cover_image);

  return (
    <div className={`cover ${small ? "cover-small" : ""}`}>
      {!imageFailed && (
        <Image
          src={issue.cover_image}
          loader={remoteImage ? ({ src }) => src : undefined}
          unoptimized={remoteImage}
          alt={`${issue.year} 年 ${issue.month} 月號封面`}
          fill
          priority={!small}
          sizes={small ? "300px" : "(max-width: 760px) 84vw, 430px"}
          onError={() => setImageFailed(true)}
        />
      )}
      <div className="cover-placeholder" aria-hidden={!imageFailed}>
        <strong>雙和醫訊</strong>
        <span>{issue.year}.{String(issue.month).padStart(2, "0")}</span>
        <b>封面尚待提供</b>
      </div>
    </div>
  );
}
