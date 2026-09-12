export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      application_documents: {
        Row: {
          application_id: string;
          document_type: Database["public"]["Enums"]["document_type"];
          document_version_id: string;
          owner_id: string;
          selected_at: string;
        };
        Insert: {
          application_id: string;
          document_type: Database["public"]["Enums"]["document_type"];
          document_version_id: string;
          owner_id: string;
          selected_at?: string;
        };
        Update: {
          application_id?: string;
          document_type?: Database["public"]["Enums"]["document_type"];
          document_version_id?: string;
          owner_id?: string;
          selected_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_documents_application_fk";
            columns: ["application_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id", "owner_id"];
          },
          {
            foreignKeyName: "application_documents_version_fk";
            columns: ["document_version_id", "owner_id", "document_type"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id", "owner_id", "document_type"];
          },
        ];
      };
      application_status_history: {
        Row: {
          application_id: string;
          changed_at: string;
          from_status: Database["public"]["Enums"]["application_status"] | null;
          id: string;
          owner_id: string;
          to_status: Database["public"]["Enums"]["application_status"];
        };
        Insert: {
          application_id: string;
          changed_at?: string;
          from_status?:
            | Database["public"]["Enums"]["application_status"]
            | null;
          id?: string;
          owner_id: string;
          to_status: Database["public"]["Enums"]["application_status"];
        };
        Update: {
          application_id?: string;
          changed_at?: string;
          from_status?:
            | Database["public"]["Enums"]["application_status"]
            | null;
          id?: string;
          owner_id?: string;
          to_status?: Database["public"]["Enums"]["application_status"];
        };
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_fk";
            columns: ["application_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      applications: {
        Row: {
          applied_on: string | null;
          archived_at: string | null;
          attempt_number: number;
          created_at: string;
          documents_locked_at: string | null;
          id: string;
          interview_at: string | null;
          job_posting_id: string;
          note: string | null;
          owner_id: string;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
        };
        Insert: {
          applied_on?: string | null;
          archived_at?: string | null;
          attempt_number: number;
          created_at?: string;
          documents_locked_at?: string | null;
          id?: string;
          interview_at?: string | null;
          job_posting_id: string;
          note?: string | null;
          owner_id: string;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
        };
        Update: {
          applied_on?: string | null;
          archived_at?: string | null;
          attempt_number?: number;
          created_at?: string;
          documents_locked_at?: string | null;
          id?: string;
          interview_at?: string | null;
          job_posting_id?: string;
          note?: string | null;
          owner_id?: string;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_posting_fk";
            columns: ["job_posting_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "job_postings";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      document_publications: {
        Row: {
          document_type: Database["public"]["Enums"]["document_type"];
          document_version_id: string;
          owner_id: string;
          published_at: string;
          updated_at: string;
        };
        Insert: {
          document_type: Database["public"]["Enums"]["document_type"];
          document_version_id: string;
          owner_id: string;
          published_at?: string;
          updated_at?: string;
        };
        Update: {
          document_type?: Database["public"]["Enums"]["document_type"];
          document_version_id?: string;
          owner_id?: string;
          published_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_publications_version_fk";
            columns: ["document_version_id", "owner_id", "document_type"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id", "owner_id", "document_type"];
          },
        ];
      };
      document_versions: {
        Row: {
          archived_at: string | null;
          content_hash: string;
          created_at: string;
          document_type: Database["public"]["Enums"]["document_type"];
          extracted_text: string | null;
          extraction_error: string | null;
          extraction_status: Database["public"]["Enums"]["document_extraction_status"];
          file_size: number;
          id: string;
          is_default: boolean;
          label: string;
          mime_type: string;
          original_filename: string;
          owner_id: string;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          content_hash: string;
          created_at?: string;
          document_type: Database["public"]["Enums"]["document_type"];
          extracted_text?: string | null;
          extraction_error?: string | null;
          extraction_status?: Database["public"]["Enums"]["document_extraction_status"];
          file_size: number;
          id?: string;
          is_default?: boolean;
          label: string;
          mime_type: string;
          original_filename: string;
          owner_id: string;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          content_hash?: string;
          created_at?: string;
          document_type?: Database["public"]["Enums"]["document_type"];
          extracted_text?: string | null;
          extraction_error?: string | null;
          extraction_status?: Database["public"]["Enums"]["document_extraction_status"];
          file_size?: number;
          id?: string;
          is_default?: boolean;
          label?: string;
          mime_type?: string;
          original_filename?: string;
          owner_id?: string;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      job_postings: {
        Row: {
          canonical_url: string;
          company_name: string;
          created_at: string;
          external_id: string;
          id: string;
          owner_id: string;
          search_text: string | null;
          source: Database["public"]["Enums"]["job_posting_source"];
          title: string;
          updated_at: string;
        };
        Insert: {
          canonical_url: string;
          company_name: string;
          created_at?: string;
          external_id: string;
          id?: string;
          owner_id: string;
          search_text?: string | null;
          source: Database["public"]["Enums"]["job_posting_source"];
          title: string;
          updated_at?: string;
        };
        Update: {
          canonical_url?: string;
          company_name?: string;
          created_at?: string;
          external_id?: string;
          id?: string;
          owner_id?: string;
          search_text?: string | null;
          source?: Database["public"]["Enums"]["job_posting_source"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_application_attempt: {
        Args: {
          p_applied_on: string;
          p_interview_at: string;
          p_job_posting_id: string;
          p_note: string;
          p_owner_id: string;
          p_portfolio_version_id: string;
          p_resume_version_id: string;
          p_status: Database["public"]["Enums"]["application_status"];
        };
        Returns: {
          applied_on: string | null;
          archived_at: string | null;
          attempt_number: number;
          created_at: string;
          documents_locked_at: string | null;
          id: string;
          interview_at: string | null;
          job_posting_id: string;
          note: string | null;
          owner_id: string;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_application_with_posting: {
        Args: {
          p_applied_on: string;
          p_canonical_url: string;
          p_company_name: string;
          p_external_id: string;
          p_interview_at: string;
          p_note: string;
          p_owner_id: string;
          p_portfolio_version_id: string;
          p_resume_version_id: string;
          p_source: Database["public"]["Enums"]["job_posting_source"];
          p_status: Database["public"]["Enums"]["application_status"];
          p_title: string;
        };
        Returns: {
          applied_on: string | null;
          archived_at: string | null;
          attempt_number: number;
          created_at: string;
          documents_locked_at: string | null;
          id: string;
          interview_at: string | null;
          job_posting_id: string;
          note: string | null;
          owner_id: string;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      register_document_version: {
        Args: {
          p_content_hash: string;
          p_document_type: Database["public"]["Enums"]["document_type"];
          p_file_size: number;
          p_id: string;
          p_label: string;
          p_mime_type: string;
          p_original_filename: string;
          p_owner_id: string;
          p_storage_path: string;
        };
        Returns: {
          archived_at: string | null;
          content_hash: string;
          created_at: string;
          document_type: Database["public"]["Enums"]["document_type"];
          extracted_text: string | null;
          extraction_error: string | null;
          extraction_status: Database["public"]["Enums"]["document_extraction_status"];
          file_size: number;
          id: string;
          is_default: boolean;
          label: string;
          mime_type: string;
          original_filename: string;
          owner_id: string;
          storage_path: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "document_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      replace_application_state: {
        Args: {
          p_application_id: string;
          p_applied_on: string;
          p_archived: boolean;
          p_interview_at: string;
          p_note: string;
          p_owner_id: string;
          p_portfolio_version_id: string;
          p_resume_version_id: string;
          p_status: Database["public"]["Enums"]["application_status"];
        };
        Returns: {
          applied_on: string | null;
          archived_at: string | null;
          attempt_number: number;
          created_at: string;
          documents_locked_at: string | null;
          id: string;
          interview_at: string | null;
          job_posting_id: string;
          note: string | null;
          owner_id: string;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_default_document_version: {
        Args: {
          p_document_type: Database["public"]["Enums"]["document_type"];
          p_document_version_id: string;
          p_owner_id: string;
        };
        Returns: {
          archived_at: string | null;
          content_hash: string;
          created_at: string;
          document_type: Database["public"]["Enums"]["document_type"];
          extracted_text: string | null;
          extraction_error: string | null;
          extraction_status: Database["public"]["Enums"]["document_extraction_status"];
          file_size: number;
          id: string;
          is_default: boolean;
          label: string;
          mime_type: string;
          original_filename: string;
          owner_id: string;
          storage_path: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "document_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_job_posting_details: {
        Args: {
          p_company_name: string;
          p_job_posting_id: string;
          p_owner_id: string;
          p_title: string;
        };
        Returns: {
          canonical_url: string;
          company_name: string;
          created_at: string;
          external_id: string;
          id: string;
          owner_id: string;
          search_text: string | null;
          source: Database["public"]["Enums"]["job_posting_source"];
          title: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "job_postings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      application_status:
        | "interested"
        | "preparing"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn";
      document_extraction_status: "pending" | "processing" | "ready" | "failed";
      document_type: "resume" | "portfolio";
      job_posting_source: "wanted";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
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
      job_posting_source: ["wanted"],
    },
  },
} as const;
