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
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      m_employees: {
        Row: {
          annual_leave_quota: number;
          created_at: string | null;
          department: string | null;
          employee_number: string | null;
          employment_type: string;
          full_name: string;
          id: number;
          join_date: string | null;
          resign_date: string | null;
          role_title: string;
          status: string;
        };
        Insert: {
          annual_leave_quota?: number;
          created_at?: string | null;
          department?: string | null;
          employee_number?: string | null;
          employment_type?: string;
          full_name: string;
          id?: number;
          join_date?: string | null;
          resign_date?: string | null;
          role_title: string;
          status?: string;
        };
        Update: {
          annual_leave_quota?: number;
          created_at?: string | null;
          department?: string | null;
          employee_number?: string | null;
          employment_type?: string;
          full_name?: string;
          id?: number;
          join_date?: string | null;
          resign_date?: string | null;
          role_title?: string;
          status?: string;
        };
        Relationships: [];
      };
      m_features: {
        Row: {
          feature_key: string;
          feature_name: string;
          icon_name: string | null;
          id: number;
          path: string | null;
        };
        Insert: {
          feature_key: string;
          feature_name: string;
          icon_name?: string | null;
          id?: number;
          path?: string | null;
        };
        Update: {
          feature_key?: string;
          feature_name?: string;
          icon_name?: string | null;
          id?: number;
          path?: string | null;
        };
        Relationships: [];
      };
      m_holidays: {
        Row: {
          created_at: string;
          date: string;
          id: number;
          is_national: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          id?: number;
          is_national?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: number;
          is_national?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      m_project_members: {
        Row: {
          created_at: string;
          project_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          project_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          project_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "m_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_project_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_project_types: {
        Row: {
          id: number;
          type_name: string;
        };
        Insert: {
          id?: number;
          type_name: string;
        };
        Update: {
          id?: number;
          type_name?: string;
        };
        Relationships: [];
      };
      m_projects: {
        Row: {
          client: string;
          created_at: string | null;
          end_date: string | null;
          id: number;
          pic_contact: string | null;
          pic_name: string | null;
          priority: string;
          project_code: string;
          project_name: string;
          start_date: string | null;
          status_id: number | null;
        };
        Insert: {
          client: string;
          created_at?: string | null;
          end_date?: string | null;
          id?: number;
          pic_contact?: string | null;
          pic_name?: string | null;
          priority?: string;
          project_code: string;
          project_name: string;
          start_date?: string | null;
          status_id?: number | null;
        };
        Update: {
          client?: string;
          created_at?: string | null;
          end_date?: string | null;
          id?: number;
          pic_contact?: string | null;
          pic_name?: string | null;
          priority?: string;
          project_code?: string;
          project_name?: string;
          start_date?: string | null;
          status_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "m_projects_status_id_fkey";
            columns: ["status_id"];
            isOneToOne: false;
            referencedRelation: "m_work_status";
            referencedColumns: ["id"];
          },
        ];
      };
      m_roles: {
        Row: {
          id: number;
          rank: number;
          role_name: string;
        };
        Insert: {
          id?: number;
          rank?: number;
          role_name: string;
        };
        Update: {
          id?: number;
          rank?: number;
          role_name?: string;
        };
        Relationships: [];
      };
      m_work_schedule: {
        Row: {
          clock_in_time: string;
          clock_out_time: string;
          company_name: string;
          id: number;
          late_tolerance_minutes: number;
          locked_until: string | null;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          work_days: number[];
        };
        Insert: {
          clock_in_time?: string;
          clock_out_time?: string;
          company_name?: string;
          id?: number;
          late_tolerance_minutes?: number;
          locked_until?: string | null;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          work_days?: number[];
        };
        Update: {
          clock_in_time?: string;
          clock_out_time?: string;
          company_name?: string;
          id?: number;
          late_tolerance_minutes?: number;
          locked_until?: string | null;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          work_days?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "m_work_schedule_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_work_status: {
        Row: {
          id: number;
          status_name: string;
        };
        Insert: {
          id?: number;
          status_name: string;
        };
        Update: {
          id?: number;
          status_name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          employee_id: number | null;
          full_name: string | null;
          id: string;
          is_superadmin: boolean;
          language_preference: string;
          phone_number: string | null;
          role_id: number | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          employee_id?: number | null;
          full_name?: string | null;
          id: string;
          is_superadmin?: boolean;
          language_preference?: string;
          phone_number?: string | null;
          role_id?: number | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          employee_id?: number | null;
          full_name?: string | null;
          id?: string;
          is_superadmin?: boolean;
          language_preference?: string;
          phone_number?: string | null;
          role_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "m_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "m_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_type_assignment: {
        Row: {
          project_id: number;
          type_id: number;
        };
        Insert: {
          project_id: number;
          type_id: number;
        };
        Update: {
          project_id?: number;
          type_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_type_assignment_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "m_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_type_assignment_type_id_fkey";
            columns: ["type_id"];
            isOneToOne: false;
            referencedRelation: "m_project_types";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_channels: {
        Row: {
          created_at: string;
          dm_user_a: string | null;
          dm_user_b: string | null;
          id: number;
          name: string | null;
          project_id: number | null;
          type: string;
        };
        Insert: {
          created_at?: string;
          dm_user_a?: string | null;
          dm_user_b?: string | null;
          id?: number;
          name?: string | null;
          project_id?: number | null;
          type: string;
        };
        Update: {
          created_at?: string;
          dm_user_a?: string | null;
          dm_user_b?: string | null;
          id?: number;
          name?: string | null;
          project_id?: number | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_channels_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "m_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_channels_dm_user_a_fkey";
            columns: ["dm_user_a"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_channels_dm_user_b_fkey";
            columns: ["dm_user_b"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_messages: {
        Row: {
          body: string;
          channel_id: number;
          created_at: string;
          edited_at: string | null;
          forwarded_from_sender_name: string | null;
          id: number;
          mentions: string[];
          mentions_everyone: boolean;
          payload: Json | null;
          pinned_at: string | null;
          pinned_by: string | null;
          reply_to_id: number | null;
          sender_id: string;
        };
        Insert: {
          body: string;
          channel_id: number;
          created_at?: string;
          edited_at?: string | null;
          forwarded_from_sender_name?: string | null;
          id?: number;
          mentions?: string[];
          mentions_everyone?: boolean;
          payload?: Json | null;
          pinned_at?: string | null;
          pinned_by?: string | null;
          reply_to_id?: number | null;
          sender_id: string;
        };
        Update: {
          body?: string;
          channel_id?: number;
          created_at?: string;
          edited_at?: string | null;
          forwarded_from_sender_name?: string | null;
          id?: number;
          mentions?: string[];
          mentions_everyone?: boolean;
          payload?: Json | null;
          pinned_at?: string | null;
          pinned_by?: string | null;
          reply_to_id?: number | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_messages_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_messages_pinned_by_fkey";
            columns: ["pinned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_channel_reads: {
        Row: {
          channel_id: number;
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          channel_id: number;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          channel_id?: number;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_channel_reads_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_channel_reads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_attachments: {
        Row: {
          created_at: string;
          file_name: string;
          file_path: string;
          file_size: number | null;
          file_type: string | null;
          id: number;
          message_id: number;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          message_id: number;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          message_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_poll_votes: {
        Row: {
          created_at: string;
          message_id: number;
          option_idx: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          message_id: number;
          option_idx: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          message_id?: number;
          option_idx?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_poll_votes_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_poll_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_chat_message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: number;
          message_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: number;
          message_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: number;
          message_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_chat_message_reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "t_chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_chat_message_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_attendance: {
        Row: {
          attachment_name: string | null;
          attachment_path: string | null;
          clock_in: string | null;
          clock_out: string | null;
          created_at: string;
          date: string;
          id: number;
          note: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
        Insert: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date: string;
          id?: number;
          note?: string | null;
          status: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
        };
        Update: {
          attachment_name?: string | null;
          attachment_path?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
          created_at?: string;
          date?: string;
          id?: number;
          note?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_attendance_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_attendance_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: Json | null;
          entity_id: string;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          entity_id: string;
          entity_type: string;
          id?: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          entity_id?: string;
          entity_type?: string;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_daily_tasks: {
        Row: {
          created_at: string | null;
          date: string;
          employee_id: number | null;
          id: number;
          is_resolved: boolean;
          problem_desc: string | null;
          progress_pct: number;
          project_id: number | null;
          task_desc: string;
        };
        Insert: {
          created_at?: string | null;
          date: string;
          employee_id?: number | null;
          id?: number;
          is_resolved?: boolean;
          problem_desc?: string | null;
          progress_pct?: number;
          project_id?: number | null;
          task_desc: string;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          employee_id?: number | null;
          id?: number;
          is_resolved?: boolean;
          problem_desc?: string | null;
          progress_pct?: number;
          project_id?: number | null;
          task_desc?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_daily_tasks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "m_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_daily_tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "m_projects";
            referencedColumns: ["id"];
          },
        ];
      };
      t_employee_rates: {
        Row: {
          base_salary: number;
          id: number;
          local_trip_rate: number;
          out_of_town_rate: number;
          overtime_rate: number;
          profile_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          base_salary?: number;
          id?: number;
          local_trip_rate?: number;
          out_of_town_rate?: number;
          overtime_rate?: number;
          profile_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          base_salary?: number;
          id?: number;
          local_trip_rate?: number;
          out_of_town_rate?: number;
          overtime_rate?: number;
          profile_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_employee_rates_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_employee_rates_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_leave_requests: {
        Row: {
          approved_by: string | null;
          created_at: string;
          end_date: string;
          id: number;
          reason: string;
          rejection_note: string | null;
          start_date: string;
          status: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          end_date: string;
          id?: number;
          reason: string;
          rejection_note?: string | null;
          start_date: string;
          status?: string;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          end_date?: string;
          id?: number;
          reason?: string;
          rejection_note?: string | null;
          start_date?: string;
          status?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_leave_requests_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_leave_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: number;
          is_read: boolean;
          link: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: number;
          is_read?: boolean;
          link?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: number;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_overtime_business_trips: {
        Row: {
          activity_description: string;
          approved_by: string | null;
          created_at: string;
          daily_allowance: number | null;
          date: string;
          duration_hours: number | null;
          end_date: string | null;
          end_time: string | null;
          id: number;
          project_id: number | null;
          rejection_note: string | null;
          start_time: string | null;
          status: string;
          type: string;
          user_id: string;
        };
        Insert: {
          activity_description: string;
          approved_by?: string | null;
          created_at?: string;
          daily_allowance?: number | null;
          date: string;
          duration_hours?: number | null;
          end_date?: string | null;
          end_time?: string | null;
          id?: number;
          project_id?: number | null;
          rejection_note?: string | null;
          start_time?: string | null;
          status?: string;
          type: string;
          user_id: string;
        };
        Update: {
          activity_description?: string;
          approved_by?: string | null;
          created_at?: string;
          daily_allowance?: number | null;
          date?: string;
          duration_hours?: number | null;
          end_date?: string | null;
          end_time?: string | null;
          id?: number;
          project_id?: number | null;
          rejection_note?: string | null;
          start_time?: string | null;
          status?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_overtime_business_trips_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_overtime_business_trips_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "m_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_overtime_business_trips_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_payroll_lines: {
        Row: {
          base_salary: number;
          bpjs: number;
          deduction_note: string | null;
          gross: number;
          id: number;
          local_trip_days: number;
          local_trip_pay: number;
          net: number;
          other_deduction: number;
          out_of_town_days: number;
          out_of_town_pay: number;
          overtime_hours: number;
          overtime_pay: number;
          paid_at: string | null;
          payment_status: string;
          pph21: number;
          run_id: number;
          user_id: string;
        };
        Insert: {
          base_salary?: number;
          bpjs?: number;
          deduction_note?: string | null;
          id?: number;
          local_trip_days?: number;
          local_trip_pay?: number;
          other_deduction?: number;
          out_of_town_days?: number;
          out_of_town_pay?: number;
          overtime_hours?: number;
          overtime_pay?: number;
          paid_at?: string | null;
          payment_status?: string;
          pph21?: number;
          run_id: number;
          user_id: string;
        };
        Update: {
          base_salary?: number;
          bpjs?: number;
          deduction_note?: string | null;
          id?: number;
          local_trip_days?: number;
          local_trip_pay?: number;
          other_deduction?: number;
          out_of_town_days?: number;
          out_of_town_pay?: number;
          overtime_hours?: number;
          overtime_pay?: number;
          paid_at?: string | null;
          payment_status?: string;
          pph21?: number;
          run_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_payroll_lines_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "t_payroll_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_payroll_lines_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_payroll_runs: {
        Row: {
          created_at: string;
          created_by: string | null;
          finalized_at: string | null;
          finalized_by: string | null;
          id: number;
          note: string | null;
          period: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: number;
          note?: string | null;
          period: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: number;
          note?: string | null;
          period?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_payroll_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_payroll_runs_finalized_by_fkey";
            columns: ["finalized_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_role_permissions: {
        Row: {
          can_create: boolean;
          can_delete: boolean;
          can_read: boolean;
          can_update: boolean;
          feature_id: number | null;
          id: number;
          role_id: number | null;
        };
        Insert: {
          can_create?: boolean;
          can_delete?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          feature_id?: number | null;
          id?: number;
          role_id?: number | null;
        };
        Update: {
          can_create?: boolean;
          can_delete?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          feature_id?: number | null;
          id?: number;
          role_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_role_permissions_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "m_features";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "m_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_task_attachments: {
        Row: {
          created_at: string;
          file_name: string;
          file_path: string;
          id: number;
          task_id: number;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_path: string;
          id?: number;
          task_id: number;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_path?: string;
          id?: number;
          task_id?: number;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_task_attachments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "t_daily_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_task_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_task_comments: {
        Row: {
          comment: string;
          created_at: string;
          id: number;
          mentions: string[];
          task_id: number;
          user_id: string;
        };
        Insert: {
          comment: string;
          created_at?: string;
          id?: number;
          mentions?: string[];
          task_id: number;
          user_id: string;
        };
        Update: {
          comment?: string;
          created_at?: string;
          id?: number;
          mentions?: string[];
          task_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_task_comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "t_daily_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_task_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_user_access_override: {
        Row: {
          can_create: boolean | null;
          can_delete: boolean | null;
          can_read: boolean | null;
          can_update: boolean | null;
          feature_id: number | null;
          id: number;
          is_override_active: boolean;
          user_id: string | null;
        };
        Insert: {
          can_create?: boolean | null;
          can_delete?: boolean | null;
          can_read?: boolean | null;
          can_update?: boolean | null;
          feature_id?: number | null;
          id?: number;
          is_override_active?: boolean;
          user_id?: string | null;
        };
        Update: {
          can_create?: boolean | null;
          can_delete?: boolean | null;
          can_read?: boolean | null;
          can_update?: boolean | null;
          feature_id?: number | null;
          id?: number;
          is_override_active?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_user_access_override_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "m_features";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_user_access_override_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      attendance_check_out: {
        Args: never;
        Returns: {
          clock_in: string | null;
          clock_out: string | null;
          created_at: string;
          date: string;
          id: number;
          note: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
        };
      };
      generate_payroll_run: {
        Args: { p_period: string };
        Returns: number;
      };
      get_or_create_dm_channel: {
        Args: { p_other_user: string };
        Returns: number;
      };
      chat_toggle_vote: {
        Args: { p_message_id: number; p_option: number };
        Returns: undefined;
      };
      get_chat_last_messages: {
        Args: never;
        Returns: {
          channel_id: number;
          sender_id: string;
          sender_name: string | null;
          body: string | null;
          attachment_count: number;
          created_at: string;
        }[];
      };
      get_unread_mention_counts: {
        Args: never;
        Returns: {
          channel_id: number;
          unread_count: number;
        }[];
      };
      superadmin_stats: {
        Args: never;
        Returns: Json;
      };
      superadmin_monitor: {
        Args: never;
        Returns: Json;
      };
      log_client_error: {
        Args: { p_source: string; p_message: string; p_context?: Json };
        Returns: undefined;
      };
      superadmin_wipe_all_data: {
        Args: never;
        Returns: Json;
      };
      superadmin_seed_demo_data: {
        Args: { p_holidays?: Json };
        Returns: Json;
      };
      get_users_with_email: {
        Args: never;
        Returns: {
          avatar_url: string;
          banned_until: string;
          created_at: string;
          email: string;
          employee_id: number;
          employee_name: string;
          employee_role_title: string;
          full_name: string;
          id: string;
          is_superadmin: boolean;
          role_id: number;
          role_name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
