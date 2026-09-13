export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      analysis_job_events: {
        Row: {
          analysis_job_id: string
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          event_id: string
          event_type: string
          message: string | null
          occurred_at: string
          owner_id: string
          received_at: string
          retry_at: string | null
          run_attempt: number
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          step: string | null
          step_attempt: number | null
        }
        Insert: {
          analysis_job_id: string
          error_code?: string | null
          error_message?: string | null
          error_retryable?: boolean
          event_id: string
          event_type: string
          message?: string | null
          occurred_at: string
          owner_id: string
          received_at?: string
          retry_at?: string | null
          run_attempt: number
          stage?: Database["public"]["Enums"]["analysis_job_stage"] | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          step?: string | null
          step_attempt?: number | null
        }
        Update: {
          analysis_job_id?: string
          error_code?: string | null
          error_message?: string | null
          error_retryable?: boolean
          event_id?: string
          event_type?: string
          message?: string | null
          occurred_at?: string
          owner_id?: string
          received_at?: string
          retry_at?: string | null
          run_attempt?: number
          stage?: Database["public"]["Enums"]["analysis_job_stage"] | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          step?: string | null
          step_attempt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_job_events_job_fk"
            columns: ["analysis_job_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          application_id: string
          attempt_count: number
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          final_event_id: string | null
          finished_at: string | null
          id: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated: boolean
          resume_version_id: string
          retry_at: string | null
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
        }
        Insert: {
          application_id: string
          attempt_count?: number
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          error_code?: string | null
          error_message?: string | null
          error_retryable?: boolean
          final_event_id?: string | null
          finished_at?: string | null
          id?: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at?: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type?:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated?: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated?: boolean
          resume_version_id: string
          retry_at?: string | null
          stage?: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string
          attempt_count?: number
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          error_code?: string | null
          error_message?: string | null
          error_retryable?: boolean
          final_event_id?: string | null
          finished_at?: string | null
          id?: string
          job_posting_content_hash?: string
          job_posting_id?: string
          job_posting_snapshot_id?: string
          job_posting_text?: string
          last_heartbeat_at?: string | null
          owner_id?: string
          portfolio_content_hash?: string
          portfolio_document_type?:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length?: number
          portfolio_text?: string
          portfolio_truncated?: boolean
          portfolio_version_id?: string
          request_id?: string
          resume_content_hash?: string
          resume_original_length?: number
          resume_text?: string
          resume_truncated?: boolean
          resume_version_id?: string
          retry_at?: string | null
          stage?: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_application_fk"
            columns: ["application_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "analysis_jobs_portfolio_fk"
            columns: [
              "portfolio_version_id",
              "owner_id",
              "portfolio_document_type",
            ]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "owner_id", "document_type"]
          },
          {
            foreignKeyName: "analysis_jobs_posting_fk"
            columns: ["job_posting_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "analysis_jobs_resume_fk"
            columns: ["resume_version_id", "owner_id", "document_type"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "owner_id", "document_type"]
          },
          {
            foreignKeyName: "analysis_jobs_snapshot_fk"
            columns: ["job_posting_snapshot_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_posting_snapshots"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      analysis_results: {
        Row: {
          analysis_job_id: string
          completed_event_id: string
          created_at: string
          job_posting_facts: Json
          owner_id: string
          result: Json
          schema_version: string
        }
        Insert: {
          analysis_job_id: string
          completed_event_id: string
          created_at?: string
          job_posting_facts: Json
          owner_id: string
          result: Json
          schema_version: string
        }
        Update: {
          analysis_job_id?: string
          completed_event_id?: string
          created_at?: string
          job_posting_facts?: Json
          owner_id?: string
          result?: Json
          schema_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_results_job_fk"
            columns: ["analysis_job_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      analysis_step_executions: {
        Row: {
          analysis_job_id: string
          attempt_count: number
          created_at: string
          id: string
          input_tokens: number
          latency_ms: number
          model: string
          output_tokens: number
          owner_id: string
          prompt_version: string
          response_id: string | null
          step: string
        }
        Insert: {
          analysis_job_id: string
          attempt_count: number
          created_at?: string
          id?: string
          input_tokens: number
          latency_ms: number
          model: string
          output_tokens: number
          owner_id: string
          prompt_version: string
          response_id?: string | null
          step: string
        }
        Update: {
          analysis_job_id?: string
          attempt_count?: number
          created_at?: string
          id?: string
          input_tokens?: number
          latency_ms?: number
          model?: string
          output_tokens?: number
          owner_id?: string
          prompt_version?: string
          response_id?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_step_executions_job_fk"
            columns: ["analysis_job_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      api_idempotency_records: {
        Row: {
          completed_at: string | null
          created_at: string
          execution_id: string
          expires_at: string
          idempotency_key: string
          original_request_id: string
          owner_id: string
          request_fingerprint: string
          request_method: string
          request_path: string
          response_body: Json | null
          response_status: number | null
          status: Database["public"]["Enums"]["api_idempotency_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          execution_id: string
          expires_at?: string
          idempotency_key: string
          original_request_id: string
          owner_id: string
          request_fingerprint: string
          request_method: string
          request_path: string
          response_body?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["api_idempotency_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          execution_id?: string
          expires_at?: string
          idempotency_key?: string
          original_request_id?: string
          owner_id?: string
          request_fingerprint?: string
          request_method?: string
          request_path?: string
          response_body?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["api_idempotency_status"]
        }
        Relationships: []
      }
      application_documents: {
        Row: {
          application_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          document_version_id: string
          owner_id: string
          selected_at: string
        }
        Insert: {
          application_id: string
          document_type: Database["public"]["Enums"]["document_type"]
          document_version_id: string
          owner_id: string
          selected_at?: string
        }
        Update: {
          application_id?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          document_version_id?: string
          owner_id?: string
          selected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_fk"
            columns: ["application_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "application_documents_version_fk"
            columns: ["document_version_id", "owner_id", "document_type"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "owner_id", "document_type"]
          },
        ]
      }
      application_status_history: {
        Row: {
          application_id: string
          changed_at: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          owner_id: string
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          application_id: string
          changed_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          owner_id: string
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          application_id?: string
          changed_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          owner_id?: string
          to_status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_fk"
            columns: ["application_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_on: string | null
          archived_at: string | null
          attempt_number: number
          created_at: string
          documents_locked_at: string | null
          id: string
          interview_at: string | null
          job_posting_id: string
          note: string | null
          owner_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          applied_on?: string | null
          archived_at?: string | null
          attempt_number: number
          created_at?: string
          documents_locked_at?: string | null
          id?: string
          interview_at?: string | null
          job_posting_id: string
          note?: string | null
          owner_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          applied_on?: string | null
          archived_at?: string | null
          attempt_number?: number
          created_at?: string
          documents_locked_at?: string | null
          id?: string
          interview_at?: string | null
          job_posting_id?: string
          note?: string | null
          owner_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_posting_fk"
            columns: ["job_posting_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      document_publications: {
        Row: {
          document_type: Database["public"]["Enums"]["document_type"]
          document_version_id: string
          owner_id: string
          published_at: string
          updated_at: string
        }
        Insert: {
          document_type: Database["public"]["Enums"]["document_type"]
          document_version_id: string
          owner_id: string
          published_at?: string
          updated_at?: string
        }
        Update: {
          document_type?: Database["public"]["Enums"]["document_type"]
          document_version_id?: string
          owner_id?: string
          published_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_publications_version_fk"
            columns: ["document_version_id", "owner_id", "document_type"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "owner_id", "document_type"]
          },
        ]
      }
      document_versions: {
        Row: {
          archived_at: string | null
          content_hash: string
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: Database["public"]["Enums"]["document_extraction_status"]
          file_size: number
          id: string
          is_default: boolean
          label: string
          mime_type: string
          original_filename: string
          owner_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          content_hash: string
          created_at?: string
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: Database["public"]["Enums"]["document_extraction_status"]
          file_size: number
          id?: string
          is_default?: boolean
          label: string
          mime_type: string
          original_filename: string
          owner_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          content_hash?: string
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: Database["public"]["Enums"]["document_extraction_status"]
          file_size?: number
          id?: string
          is_default?: boolean
          label?: string
          mime_type?: string
          original_filename?: string
          owner_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_posting_collection_runs: {
        Row: {
          created_at: string
          error_code:
            | Database["public"]["Enums"]["job_posting_collection_error_code"]
            | null
          final_event_id: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          job_posting_id: string
          mode: Database["public"]["Enums"]["job_posting_collection_mode"]
          owner_id: string
          request_id: string
          retryable: boolean
          snapshot_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_posting_collection_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_code?:
            | Database["public"]["Enums"]["job_posting_collection_error_code"]
            | null
          final_event_id?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          job_posting_id: string
          mode: Database["public"]["Enums"]["job_posting_collection_mode"]
          owner_id: string
          request_id: string
          retryable?: boolean
          snapshot_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_posting_collection_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_code?:
            | Database["public"]["Enums"]["job_posting_collection_error_code"]
            | null
          final_event_id?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          job_posting_id?: string
          mode?: Database["public"]["Enums"]["job_posting_collection_mode"]
          owner_id?: string
          request_id?: string
          retryable?: boolean
          snapshot_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_posting_collection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_collection_runs_posting_fk"
            columns: ["job_posting_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "job_posting_collection_runs_snapshot_fk"
            columns: ["snapshot_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_posting_snapshots"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      job_posting_snapshots: {
        Row: {
          content_hash: string
          created_at: string
          fetched_at: string
          id: string
          job_posting_id: string
          normalized_content: string
          owner_id: string
          parser_version: string
          raw_content: string
          source: Database["public"]["Enums"]["job_posting_snapshot_source"]
          source_metadata: Json
        }
        Insert: {
          content_hash: string
          created_at?: string
          fetched_at: string
          id?: string
          job_posting_id: string
          normalized_content: string
          owner_id: string
          parser_version: string
          raw_content: string
          source: Database["public"]["Enums"]["job_posting_snapshot_source"]
          source_metadata: Json
        }
        Update: {
          content_hash?: string
          created_at?: string
          fetched_at?: string
          id?: string
          job_posting_id?: string
          normalized_content?: string
          owner_id?: string
          parser_version?: string
          raw_content?: string
          source?: Database["public"]["Enums"]["job_posting_snapshot_source"]
          source_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_snapshots_posting_fk"
            columns: ["job_posting_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      job_postings: {
        Row: {
          canonical_url: string
          company_name: string
          created_at: string
          external_id: string
          id: string
          owner_id: string
          search_text: string | null
          source: Database["public"]["Enums"]["job_posting_source"]
          title: string
          updated_at: string
        }
        Insert: {
          canonical_url: string
          company_name: string
          created_at?: string
          external_id: string
          id?: string
          owner_id: string
          search_text?: string | null
          source: Database["public"]["Enums"]["job_posting_source"]
          title: string
          updated_at?: string
        }
        Update: {
          canonical_url?: string
          company_name?: string
          created_at?: string
          external_id?: string
          id?: string
          owner_id?: string
          search_text?: string | null
          source?: Database["public"]["Enums"]["job_posting_source"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_analysis_attempt: {
        Args: {
          p_analysis_job_id: string
          p_event_id: string
          p_owner_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          final_event_id: string | null
          finished_at: string | null
          id: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated: boolean
          resume_version_id: string
          retry_at: string | null
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_analysis_job: {
        Args: {
          p_analysis_job_id: string
          p_event_id: string
          p_owner_id: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          final_event_id: string | null
          finished_at: string | null
          id: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated: boolean
          resume_version_id: string
          retry_at: string | null
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_api_idempotency_request: {
        Args: {
          p_execution_id: string
          p_idempotency_key: string
          p_owner_id: string
          p_request_fingerprint: string
          p_request_id: string
          p_request_method: string
          p_request_path: string
        }
        Returns: {
          outcome: string
          stored_execution_id: string
          stored_request_id: string
          stored_response_body: Json
          stored_response_status: number
        }[]
      }
      complete_analysis_job: {
        Args: {
          p_analysis_job_id: string
          p_event_id: string
          p_executions: Json
          p_job_posting_facts: Json
          p_occurred_at?: string
          p_result: Json
          p_run_attempt: number
          p_schema_version: string
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          final_event_id: string | null
          finished_at: string | null
          id: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated: boolean
          resume_version_id: string
          retry_at: string | null
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_api_idempotency_request: {
        Args: {
          p_execution_id: string
          p_idempotency_key: string
          p_owner_id: string
          p_response_body: Json
          p_response_status: number
        }
        Returns: undefined
      }
      complete_job_posting_collection: {
        Args: {
          p_collection_run_id: string
          p_content_hash?: string
          p_error_code?: Database["public"]["Enums"]["job_posting_collection_error_code"]
          p_event_id: string
          p_fetched_at?: string
          p_http_status?: number
          p_normalized_content?: string
          p_owner_id: string
          p_parser_version?: string
          p_raw_content?: string
          p_retryable?: boolean
          p_snapshot_source?: Database["public"]["Enums"]["job_posting_snapshot_source"]
          p_source_metadata?: Json
          p_status: Database["public"]["Enums"]["job_posting_collection_status"]
        }
        Returns: {
          created_at: string
          error_code:
            | Database["public"]["Enums"]["job_posting_collection_error_code"]
            | null
          final_event_id: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          job_posting_id: string
          mode: Database["public"]["Enums"]["job_posting_collection_mode"]
          owner_id: string
          request_id: string
          retryable: boolean
          snapshot_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_posting_collection_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "job_posting_collection_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_application_attempt: {
        Args: {
          p_applied_on: string
          p_interview_at: string
          p_job_posting_id: string
          p_note: string
          p_owner_id: string
          p_portfolio_version_id: string
          p_resume_version_id: string
          p_status: Database["public"]["Enums"]["application_status"]
        }
        Returns: {
          applied_on: string | null
          archived_at: string | null
          attempt_number: number
          created_at: string
          documents_locked_at: string | null
          id: string
          interview_at: string | null
          job_posting_id: string
          note: string | null
          owner_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_application_with_posting: {
        Args: {
          p_applied_on: string
          p_canonical_url: string
          p_company_name: string
          p_external_id: string
          p_interview_at: string
          p_note: string
          p_owner_id: string
          p_portfolio_version_id: string
          p_resume_version_id: string
          p_source: Database["public"]["Enums"]["job_posting_source"]
          p_status: Database["public"]["Enums"]["application_status"]
          p_title: string
        }
        Returns: {
          applied_on: string | null
          archived_at: string | null
          attempt_number: number
          created_at: string
          documents_locked_at: string | null
          id: string
          interview_at: string | null
          job_posting_id: string
          note: string | null
          owner_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_stale_analysis_jobs: {
        Args: { p_cutoff: string; p_limit?: number }
        Returns: string[]
      }
      record_analysis_event: {
        Args: {
          p_analysis_job_id: string
          p_error_code?: string
          p_error_message?: string
          p_error_retryable?: boolean
          p_event_id: string
          p_event_type: string
          p_message?: string
          p_occurred_at?: string
          p_retry_at?: string
          p_run_attempt: number
          p_stage?: Database["public"]["Enums"]["analysis_job_stage"]
          p_status: Database["public"]["Enums"]["analysis_job_status"]
          p_step?: string
          p_step_attempt?: number
        }
        Returns: {
          application_id: string
          attempt_count: number
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          error_code: string | null
          error_message: string | null
          error_retryable: boolean
          final_event_id: string | null
          finished_at: string | null
          id: string
          job_posting_content_hash: string
          job_posting_id: string
          job_posting_snapshot_id: string
          job_posting_text: string
          last_heartbeat_at: string | null
          owner_id: string
          portfolio_content_hash: string
          portfolio_document_type:
            | Database["public"]["Enums"]["document_type"]
            | null
          portfolio_original_length: number
          portfolio_text: string
          portfolio_truncated: boolean
          portfolio_version_id: string
          request_id: string
          resume_content_hash: string
          resume_original_length: number
          resume_text: string
          resume_truncated: boolean
          resume_version_id: string
          retry_at: string | null
          stage: Database["public"]["Enums"]["analysis_job_stage"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_document_version: {
        Args: {
          p_content_hash: string
          p_document_type: Database["public"]["Enums"]["document_type"]
          p_file_size: number
          p_id: string
          p_label: string
          p_mime_type: string
          p_original_filename: string
          p_owner_id: string
          p_storage_path: string
        }
        Returns: {
          archived_at: string | null
          content_hash: string
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: Database["public"]["Enums"]["document_extraction_status"]
          file_size: number
          id: string
          is_default: boolean
          label: string
          mime_type: string
          original_filename: string
          owner_id: string
          storage_path: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_api_idempotency_request: {
        Args: {
          p_execution_id: string
          p_idempotency_key: string
          p_owner_id: string
        }
        Returns: undefined
      }
      replace_application_state: {
        Args: {
          p_application_id: string
          p_applied_on: string
          p_archived: boolean
          p_interview_at: string
          p_note: string
          p_owner_id: string
          p_portfolio_version_id: string
          p_resume_version_id: string
          p_status: Database["public"]["Enums"]["application_status"]
        }
        Returns: {
          applied_on: string | null
          archived_at: string | null
          attempt_number: number
          created_at: string
          documents_locked_at: string | null
          id: string
          interview_at: string | null
          job_posting_id: string
          note: string | null
          owner_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_default_document_version: {
        Args: {
          p_document_type: Database["public"]["Enums"]["document_type"]
          p_document_version_id: string
          p_owner_id: string
        }
        Returns: {
          archived_at: string | null
          content_hash: string
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: Database["public"]["Enums"]["document_extraction_status"]
          file_size: number
          id: string
          is_default: boolean
          label: string
          mime_type: string
          original_filename: string
          owner_id: string
          storage_path: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_job_posting_details: {
        Args: {
          p_company_name: string
          p_job_posting_id: string
          p_owner_id: string
          p_title: string
        }
        Returns: {
          canonical_url: string
          company_name: string
          created_at: string
          external_id: string
          id: string
          owner_id: string
          search_text: string | null
          source: Database["public"]["Enums"]["job_posting_source"]
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "job_postings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      analysis_job_stage:
        | "dispatching"
        | "fetching"
        | "normalizing"
        | "extracting"
        | "matching"
        | "generating_questions"
        | "saving"
        | "notifying"
      analysis_job_status:
        | "queued"
        | "running"
        | "needs_input"
        | "retrying"
        | "succeeded"
        | "failed"
        | "cancelled"
      api_idempotency_status: "processing" | "completed"
      application_status:
        | "interested"
        | "preparing"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      document_extraction_status: "pending" | "processing" | "ready" | "failed"
      document_type: "resume" | "portfolio"
      job_posting_collection_error_code:
        | "ACCESS_BLOCKED"
        | "JOB_EXPIRED"
        | "REDIRECT_NOT_ALLOWED"
        | "INVALID_CONTENT_TYPE"
        | "CONTENT_TOO_LARGE"
        | "INVALID_JOB_POSTING"
        | "PARSER_STRUCTURE_CHANGED"
        | "URL_MISMATCH"
        | "TIMEOUT"
        | "NETWORK_ERROR"
        | "RATE_LIMITED"
        | "UPSTREAM_ERROR"
        | "DISPATCH_FAILED"
      job_posting_collection_mode: "automatic" | "manual"
      job_posting_collection_status:
        | "queued"
        | "running"
        | "succeeded"
        | "needs_input"
        | "failed"
      job_posting_snapshot_source: "wanted_json_ld" | "manual"
      job_posting_source: "wanted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analysis_job_stage: [
        "dispatching",
        "fetching",
        "normalizing",
        "extracting",
        "matching",
        "generating_questions",
        "saving",
        "notifying",
      ],
      analysis_job_status: [
        "queued",
        "running",
        "needs_input",
        "retrying",
        "succeeded",
        "failed",
        "cancelled",
      ],
      api_idempotency_status: ["processing", "completed"],
      application_status: [
        "interested",
        "preparing",
        "applied",
        "screening",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      document_extraction_status: ["pending", "processing", "ready", "failed"],
      document_type: ["resume", "portfolio"],
      job_posting_collection_error_code: [
        "ACCESS_BLOCKED",
        "JOB_EXPIRED",
        "REDIRECT_NOT_ALLOWED",
        "INVALID_CONTENT_TYPE",
        "CONTENT_TOO_LARGE",
        "INVALID_JOB_POSTING",
        "PARSER_STRUCTURE_CHANGED",
        "URL_MISMATCH",
        "TIMEOUT",
        "NETWORK_ERROR",
        "RATE_LIMITED",
        "UPSTREAM_ERROR",
        "DISPATCH_FAILED",
      ],
      job_posting_collection_mode: ["automatic", "manual"],
      job_posting_collection_status: [
        "queued",
        "running",
        "succeeded",
        "needs_input",
        "failed",
      ],
      job_posting_snapshot_source: ["wanted_json_ld", "manual"],
      job_posting_source: ["wanted"],
    },
  },
} as const
