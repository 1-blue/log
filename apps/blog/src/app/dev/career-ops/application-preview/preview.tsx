"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";

import {
  type ApplicationDetail,
  applicationStatusRequiresDocuments,
  type JobPostingCollectionRun,
  type JobPostingSnapshot,
} from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/Tabs";

import { ApplicationStatusBadge } from "#/app/admin/(protected)/_components/ApplicationStatusBadge";
import { ApplicationStatusPanel } from "#/app/admin/(protected)/_components/ApplicationStatusPanel";
import { ApplicationInfoTab } from "#/app/admin/(protected)/applications/[id]/_components/ApplicationDetail/ApplicationInfoTab";
import { ApplicationPostingTab } from "#/app/admin/(protected)/applications/[id]/_components/ApplicationDetail/ApplicationPostingTab";
import { getApplicationStatusFixture } from "#/fixtures/application-status";
import { APPLICATION_STATUS_OPTIONS } from "#/libs/application-ui";

export default function ApplicationPreview() {
  const [application, setApplication] = useState(getApplicationStatusFixture);
  const [tab, setTab] = useState("info");
  const [fail, setFail] = useState(false);
  const [manual, setManual] = useState("");
  const [showError, setShowError] = useState(false);
  const [notice, setNotice] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const snapshot: JobPostingSnapshot = {
    id: application.id,
    jobPostingId: application.jobPosting.id,
    source: "ai",
    parserVersion: "job-structure-v2",
    contentHash: "a".repeat(64),
    createdAt: application.createdAt,
    fetchedAt: application.createdAt,
    rawContent: "프론트엔드 개발자 채용. 급여는 면접 후 결정.",
    normalizedContent: "프론트엔드 개발자 채용. 급여는 면접 후 결정.",
    sourceMetadata: {
      title: "프론트엔드 개발자",
      companyName: "가상 회사",
      datePosted: null,
      validThrough: null,
      employmentType: null,
      location: null,
      industry: null,
      occupationalCategory: null,
    },
    sections: {
      companyIntroduction: null,
      positionIntroduction: null,
      expectations: null,
      mainResponsibilities: null,
      requirements: null,
      preferred: null,
      employmentConditions: "급여는 면접 후 결정.",
      process: null,
      benefits: null,
      technologies: null,
      traits: null,
      deadline: null,
      location: null,
      other: null,
    },
    warnings: [
      "원문에서 주요 업무·자격요건·우대사항을 확인하지 못했습니다. 미기재 또는 복사 누락일 수 있으니 원문을 확인해 주세요. 없는 정보는 추측하지 않았습니다.",
      "비교할 요구사항이 없어 적합도 점수를 산정할 수 없습니다. 0점이나 불합격을 의미하지 않습니다.",
    ],
  };
  const collection: JobPostingCollectionRun = {
    id: application.id,
    jobPostingId: application.jobPosting.id,
    requestId: application.id,
    status: showError ? "failed" : "succeeded",
    mode: "manual",
    errorCode: showError ? "AI_EVIDENCE_MISMATCH" : null,
    retryable: false,
    httpStatus: 200,
    snapshot,
    createdAt: application.createdAt,
    updatedAt: application.createdAt,
    startedAt: application.createdAt,
    finishedAt: application.createdAt,
  };
  function chooseDocuments() {
    setApplication((current) => ({
      ...current,
      documents: {
        resume: {
          id: "20000000-0000-4000-8000-000000000002",
          documentType: "resume",
          label: "가상 이력서",
          originalFilename: "resume.pdf",
          archivedAt: null,
        },
        portfolio: {
          id: "20000000-0000-4000-8000-000000000003",
          documentType: "portfolio",
          label: "가상 포트폴리오",
          originalFilename: "portfolio.pdf",
          archivedAt: null,
        },
      },
    }));
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setApplication(getApplicationStatusFixture());
            setNotice("");
          }}
        >
          가상 데이터 초기화
        </Button>
        <Button variant="outline" onClick={chooseDocuments}>
          문서 2개 선택
        </Button>
        <Button variant="outline" onClick={() => setFail((value) => !value)}>
          저장 실패 {fail ? "켜짐" : "꺼짐"}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setApplication((current) => ({
              ...current,
              archivedAt: current.archivedAt ? null : current.updatedAt,
            }))
          }
        >
          보관 전환
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowError((value) => !value)}
        >
          공고 오류 전환
        </Button>
        <Button
          variant="outline"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          테마 전환
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {APPLICATION_STATUS_OPTIONS.map(([status]) => (
          <ApplicationStatusBadge key={status} status={status} />
        ))}
      </div>
      <ApplicationStatusPanel
        applicationId={application.id}
        status={application.status}
        application={application}
        onSaved={setApplication}
        onRequireDocuments={() => setTab("info")}
        updateStatus={async (_, status) => {
          if (fail) throw new Error("Simulated failure");
          const updated: ApplicationDetail = {
            ...application,
            status,
            documentsLockedAt:
              application.documentsLockedAt ??
              (applicationStatusRequiresDocuments(status)
                ? new Date().toISOString()
                : null),
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }}
      />
      <p role="status" className="text-sm">
        제출 문서 잠금: {application.documentsLockedAt ? "잠김" : "미잠금"} ·{" "}
        {notice}
      </p>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="지원 상세 영역">
          <TabsTrigger value="info">지원 정보</TabsTrigger>
          <TabsTrigger value="posting">채용공고</TabsTrigger>
          <TabsTrigger value="analysis">적합도 분석</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <ApplicationInfoTab
            application={application}
            archived={Boolean(application.archivedAt)}
            disabled={false}
            locked={Boolean(application.documentsLockedAt)}
            documentsRequired={applicationStatusRequiresDocuments(
              application.status,
            )}
            pending={null}
            resumes={[]}
            portfolios={[]}
            save={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setApplication((current) => ({
                ...current,
                note: String(data.get("note") ?? ""),
                updatedAt: new Date().toISOString(),
              }));
              setNotice("가상 메모 저장 완료");
            }}
          />
        </TabsContent>
        <TabsContent value="posting">
          <ApplicationPostingTab
            activeCollection={undefined}
            collect={async () => setNotice("가상 원문 요청 완료")}
            collections={[collection]}
            disabled={false}
            latestCollection={collection}
            latestSnapshot={snapshot}
            manualContent={manual}
            metadataDiffers={false}
            pending={null}
            setManualContent={setManual}
          />
        </TabsContent>
        <TabsContent value="analysis">
          <p className="p-5">
            지원 상태는 이 탭에서도 공통 상단에서 변경합니다.
          </p>
          <Link
            className="underline"
            href="/dev/career-ops/analysis-preview?scenario=sparse"
          >
            요구사항이 없는 분석 작업 화면 확인
          </Link>
        </TabsContent>
      </Tabs>
    </>
  );
}
