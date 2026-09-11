import React from "react";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  UploadCloudIcon,
} from "lucide-react";

export type Stage = {
  notionPageId: string;
  stageName: string;
  side: string;
  phase: string;
  status: string;
  workDone: boolean;
  photoUploaded: boolean;
  drivePhotoLink: string | null;
  /**
   * Ticked automatically when Zo uploads. Kept because Notion's own gate
   * still reads them, but never shown - naming two people who no longer work
   * here, on a tick nobody made, tells Zo nothing.
   */
  jeremiahApproved: boolean;
  karenApproved: boolean;
  rajApproved: boolean;
  notes: string;
};

export type UploadState = {
  uploading: boolean;
  driveUrl: string;
  saving: boolean;
  saved: boolean;
  error: string;
  progress: string;
};

/**
 * There is no chain any more. Zo's photos go straight to Raj, so a stage is
 * either waiting on him or approved by him.
 *
 * This only renders once photoUploaded is true, so "With Raj" can never claim
 * a stage was sent when nothing was.
 */
function approvalState(stage: Stage) {
  if (stage.rajApproved) {
    return { text: "Approved", className: "bg-[#EAF8EF] text-[#16A34A]" };
  }
  return { text: "With Raj", className: "bg-[#EEF5FF] text-[#418BFF]" };
}

type StageRowProps = {
  stage: Stage;
  uploadState: UploadState | undefined;
  onUpload: (pageId: string, stageName: string, files: FileList) => void;
  onDone: (pageId: string) => void;
  /** Adds to a stage that is already submitted, without reopening it. */
  onAddPhotos?: (pageId: string, stageName: string, files: FileList) => void;
};

export function StageRow({
  stage,
  uploadState,
  onUpload,
  onDone,
  onAddPhotos,
}: StageRowProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const us = uploadState || {
    uploading: false,
    driveUrl: "",
    saving: false,
    saved: false,
    error: "",
    progress: "",
  };

  const isComplete = stage.photoUploaded;
  const wasDeclined = !stage.photoUploaded && stage.notes.includes("Declined by");

  /* ── SUBMITTED: waiting somewhere in the chain ── */
  if (isComplete) {
    const state = approvalState(stage);

    return (
      <article className="rounded-2xl border border-[#DCE4EE] bg-white px-4 py-4 shadow-[0_5px_14px_rgba(30,58,138,0.055)] sm:px-5">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${
              stage.rajApproved ? "bg-[#16A34A]" : "bg-[#93A3B8]"
            }`}
          >
            <CheckIcon aria-hidden="true" size={14} strokeWidth={3} />
          </span>
          <p
            className={`flex-1 text-[18px] font-medium leading-snug ${
              stage.rajApproved
                ? "text-[#93A3B8] line-through"
                : "text-[#1A1A2E]"
            }`}
          >
            {stage.stageName}
          </p>
          {stage.drivePhotoLink && (
            
            <a
              className="flex items-center gap-1 text-[16px] font-medium text-[#418BFF] hover:underline"
              href={stage.drivePhotoLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              View photos
              <ExternalLinkIcon size={12} strokeWidth={2.5} />
            </a>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-2 pl-9">
          <span
            className={`rounded-full px-2 py-0.5 text-[14px] font-semibold tracking-wide ${state.className}`}
          >
            {state.text}
          </span>
        </div>

        {onAddPhotos && (
          <div className="mt-3 pl-9">
            <input
              accept="image/*"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  onAddPhotos(stage.notionPageId, stage.stageName, files);
                }
                e.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />

            {us.uploading ? (
              <div className="flex items-center gap-2 rounded-xl bg-[#F1F5F9] px-4 py-2.5">
                <LoaderIcon
                  className="animate-spin text-[#418BFF]"
                  size={16}
                  strokeWidth={2.5}
                />
                <span className="text-[16px] font-medium text-[#5B6B82]">
                  {us.progress
                    ? `Adding ${us.progress} to the folder…`
                    : "Adding to the folder…"}
                </span>
              </div>
            ) : (
              <button
                className="flex items-center gap-2 rounded-xl border border-[#DCE4EE] px-3.5 py-2 text-[16px] font-medium text-[#418BFF] transition-colors hover:bg-[#F1F5F9]"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <UploadCloudIcon size={16} strokeWidth={2.5} />
                Add more photos
              </button>
            )}

            {us.error && (
              <p className="mt-2 text-[16px] font-medium text-red-500">
                {us.error}
              </p>
            )}

            <p className="mt-2 text-[14px] font-medium text-[#A3B0C0]">
              Goes in the same folder. Nothing gets re-approved.
            </p>
          </div>
        )}
      </article>
    );
  }

  /* ── NEEDS PHOTOS (fresh, or sent back) ── */
  return (
    <article className="rounded-2xl border border-[#DCE4EE] bg-white px-4 py-4 shadow-[0_5px_14px_rgba(30,58,138,0.055)] sm:px-5">
      <div className="flex items-center gap-3">
        <span className="h-6 w-6 shrink-0 rounded-md border-2 border-[#93A3B8]" />
        <p className="flex-1 text-[18px] font-medium leading-snug text-[#1A1A2E]">
          {stage.stageName}
        </p>
      </div>

      {wasDeclined && (
        <div className="mt-3 rounded-xl border border-[#FED7BE] bg-[#FFF8F4] px-3.5 py-2.5">
          <p className="text-[16px] font-semibold tracking-wide text-[#B94A18]">
            Sent back
          </p>
          <p className="mt-1 text-[16px] font-medium leading-snug text-[#733614]">
            {stage.notes}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 pl-9">
        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              onUpload(stage.notionPageId, stage.stageName, files);
            }
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />

        {!us.uploading && (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#418BFF] bg-[#EBF3FF] px-4 py-3 text-[16px] font-medium text-[#418BFF] transition-colors hover:bg-[#DBEAFE]"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadCloudIcon size={16} strokeWidth={2.5} />
            {us.driveUrl ? "Add More Photos" : "Upload Photos"}
          </button>
        )}

        {us.uploading && (
          <div className="flex items-center gap-2 rounded-xl bg-[#F1F5F9] px-4 py-3">
            <LoaderIcon
              className="animate-spin text-[#418BFF]"
              size={16}
              strokeWidth={2.5}
            />
            <span className="text-[16px] font-medium text-[#5B6B82]">
              {us.progress
                ? `Uploading ${us.progress} to Google Drive…`
                : "Uploading to Google Drive…"}
            </span>
          </div>
        )}

        <input
          className="w-full rounded-lg border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2 text-[16px] font-medium text-[#5B6B82] placeholder:text-[#A3B0C0]"
          placeholder="Drive folder link appears here after upload"
          readOnly
          type="text"
          value={us.driveUrl}
        />

        <button
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#8A99AC]"
          disabled={!us.driveUrl || us.saving}
          onClick={() => onDone(stage.notionPageId)}
          type="button"
        >
          {us.saving ? (
            <>
              <LoaderIcon className="animate-spin" size={14} strokeWidth={2.5} />
              Saving…
            </>
          ) : (
            <>
              <CheckIcon size={14} strokeWidth={3} />
              Done
            </>
          )}
        </button>

        {us.error && (
          <p className="text-[16px] font-medium text-red-500">{us.error}</p>
        )}
      </div>
    </article>
  );
}