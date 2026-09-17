"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type {
  ApplicationArchiveFilter,
  ApplicationSort,
  ApplicationStatus,
  ApplicationSummary,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import { Input } from "@workspace/ui/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/Select";

import {
  BriefcaseBusinessIcon,
  LoaderCircleIcon,
  PlusIcon,
} from "lucide-react";

import {
  APPLICATION_STATUS_OPTIONS,
  formatApplicationDate,
  getApplicationStatusLabel,
} from "#/libs/application-ui";
import { listApplications, WorkerApiError } from "#/libs/worker-client";

function errorMessage(error: unknown) {
  return error instanceof WorkerApiError
    ? error.message
    : "지원 목록을 불러오지 못했습니다.";
}

export default function ApplicationsClient() {
  const [items, setItems] = useState<ApplicationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [archived, setArchived] = useState<ApplicationArchiveFilter>("exclude");
  const [sort, setSort] = useState<ApplicationSort>("updated_desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listApplications({
        archived,
        page,
        pageSize: 20,
        sort,
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
      });
      setItems(response.data.items);
      setTotal(response.pagination.total);
      setTotalPages(response.pagination.totalPages);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [archived, page, query, sort, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">지원 관리</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            채용공고, 지원 상태, 제출 문서와 면접 일정을 관리합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/applications/new">
            <PlusIcon /> 공고 등록
          </Link>
        </Button>
      </div>

      <form
        className="border-border bg-card flex flex-wrap gap-3 rounded-lg border p-4"
        onSubmit={handleSearch}
      >
        <Input
          aria-label="회사명 또는 공고명 검색"
          className="min-w-52 flex-1"
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="회사명, 공고명, Wanted 공고 ID"
          value={search}
        />
        <Select
          onValueChange={(value) => {
            setPage(1);
            setStatus(value === "all" ? "" : (value as ApplicationStatus));
          }}
          value={status || "all"}
        >
          <SelectTrigger aria-label="지원 상태" className="w-40">
            <SelectValue placeholder="모든 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 상태</SelectItem>
            {APPLICATION_STATUS_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            setPage(1);
            setArchived(value as ApplicationArchiveFilter);
          }}
          value={archived}
        >
          <SelectTrigger aria-label="보관 상태" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exclude">사용 중</SelectItem>
            <SelectItem value="only">보관됨</SelectItem>
            <SelectItem value="include">전체</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            setPage(1);
            setSort(value as ApplicationSort);
          }}
          value={sort}
        >
          <SelectTrigger aria-label="정렬" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_desc">최근 수정순</SelectItem>
            <SelectItem value="interview_asc">면접 임박순</SelectItem>
            <SelectItem value="applied_desc">최근 지원순</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          검색
        </Button>
      </form>

      {error ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <p className="text-muted-foreground text-sm">총 {total}건</p>
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <LoaderCircleIcon className="size-4 animate-spin" /> 지원 목록을
          불러오는 중입니다.
        </div>
      ) : items.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
          표시할 지원 정보가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Link
              className="border-border bg-card hover:border-primary/50 grid gap-4 rounded-lg border p-5 transition-colors md:grid-cols-[1fr_auto]"
              href={`/admin/applications/${item.id}`}
              key={item.id}
            >
              <div className="flex min-w-0 gap-3">
                <BriefcaseBusinessIcon className="text-primary mt-0.5 size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">
                    {item.jobPosting.companyName} · {item.attemptNumber}차 지원
                  </p>
                  <h3 className="mt-1 truncate font-semibold">
                    {item.jobPosting.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-xs">
                    지원일 {formatApplicationDate(item.appliedOn)} · 면접일{" "}
                    {formatApplicationDate(item.interviewAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                {item.archivedAt ? (
                  <span className="bg-muted rounded-full px-2.5 py-1 text-xs">
                    보관됨
                  </span>
                ) : null}
                <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs">
                  {getApplicationStatusLabel(item.status)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
            variant="outline"
          >
            이전
          </Button>
          <span className="text-muted-foreground text-sm">
            {page} / {totalPages}
          </span>
          <Button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
            variant="outline"
          >
            다음
          </Button>
        </div>
      ) : null}
    </section>
  );
}
