


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bird_dogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bird_dogs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."critical_dates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "deal_name" "text" NOT NULL,
    "label" "text" NOT NULL,
    "due_on" "date" NOT NULL,
    "kind" "text",
    "completed_at" timestamp with time zone,
    "completed_by" "text",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."critical_dates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_task_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "uploaded_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_task_id" "uuid",
    CONSTRAINT "daily_task_files_one_parent" CHECK (((("task_id" IS NOT NULL) AND ("assigned_task_id" IS NULL)) OR (("task_id" IS NULL) AND ("assigned_task_id" IS NOT NULL))))
);


ALTER TABLE "public"."daily_task_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_task_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "done_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_task_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_cockpit" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'Not urgent'::"text" NOT NULL,
    "state" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "completion_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_on" "date" DEFAULT (("now"() AT TIME ZONE 'America/Chicago'::"text"))::"date" NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_on" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_on" "date",
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    CONSTRAINT "daily_tasks_completed_pair" CHECK (((("state" = 'completed'::"text") AND ("completed_at" IS NOT NULL) AND ("completed_on" IS NOT NULL)) OR (("state" = ANY (ARRAY['draft'::"text", 'backlog'::"text", 'todo'::"text", 'in_progress'::"text"])) AND ("completed_at" IS NULL) AND ("completed_on" IS NULL)))),
    CONSTRAINT "daily_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['Urgent'::"text", 'Not urgent'::"text"]))),
    CONSTRAINT "daily_tasks_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'backlog'::"text", 'todo'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."daily_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "doc_type" "text" NOT NULL,
    "status" "text" DEFAULT 'missing'::"text",
    "file_url" "text",
    "received_at" timestamp with time zone,
    CONSTRAINT "deal_documents_status_check" CHECK (("status" = ANY (ARRAY['missing'::"text", 'received'::"text"])))
);


ALTER TABLE "public"."deal_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_stages" (
    "notion_page_id" "text" NOT NULL,
    "stage" "text" DEFAULT 'intake'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moved_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deal_stages_stage_check" CHECK (("stage" = ANY (ARRAY['docs_submitted'::"text", 'underwriting'::"text", 'final_review'::"text", 'proof_of_funds'::"text", 'submit_to_broker'::"text", 'awaiting_signatures'::"text", 'under_contract'::"text", 'funded_emd'::"text", 'due_diligence'::"text", 'coe'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."deal_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_submission_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "submission_token" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitter_ip_hash" "text"
);


ALTER TABLE "public"."deal_submission_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_submission_files_backup_20260823" (
    "id" "uuid",
    "deal_id" "uuid",
    "submission_token" "uuid",
    "storage_path" "text",
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone,
    "submitter_ip_hash" "text"
);


ALTER TABLE "public"."deal_submission_files_backup_20260823" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bird_dog_id" "uuid",
    "property_address" "text",
    "source" "text" NOT NULL,
    "stage" "text" DEFAULT 'intake'::"text",
    "financials" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "deals_source_check" CHECK (("source" = ANY (ARRAY['email_backlog'::"text", 'web_form'::"text"]))),
    CONSTRAINT "deals_stage_check" CHECK (("stage" = ANY (ARRAY['intake'::"text", 'docs_complete'::"text", 'docs_generated'::"text", 'proof_of_funds'::"text", 'awaiting_signatures'::"text", 'contract'::"text", 'ops_handoff'::"text"])))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "deal_name" "text" NOT NULL,
    "doc_type" "text" NOT NULL,
    "stage" "text" DEFAULT 'requested'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_on" "date",
    "counterparty" "text",
    "file_url" "text",
    "notes" "text",
    "requested_by" "text",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documents_stage_check" CHECK (("stage" = ANY (ARRAY['requested'::"text", 'draft'::"text", 'internal_review'::"text", 'out_for_signature'::"text", 'executed'::"text", 'filed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drive_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "section" "text" NOT NULL,
    "entity" "text",
    "path_hint" "text",
    "url" "text",
    "deal_id" "uuid",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."drive_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "doc_type" "text" NOT NULL,
    "file_url" "text",
    "generated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generated_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intake_messages" (
    "message_id" "text" NOT NULL,
    "deal_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intake_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intake_messages_backup_20260823" (
    "message_id" "text",
    "deal_id" "uuid",
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."intake_messages_backup_20260823" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "source" "text",
    "notes" "text",
    "stage" "text" DEFAULT 'New'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_stage_check" CHECK (("stage" = ANY (ARRAY['New'::"text", 'Contacted'::"text", 'Qualified'::"text", 'Docs submitted'::"text", 'Dead'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient" "text" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "order_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_recipient_check" CHECK (("recipient" = ANY (ARRAY['raj'::"text", 'dane'::"text", 'karen'::"text", 'jeremiah'::"text", 'colton'::"text", 'zo'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "date_needed" "date" NOT NULL,
    "priority" "text" DEFAULT 'Normal'::"text" NOT NULL,
    "estimated_cost" numeric(12,2),
    "requested_by" "text" DEFAULT 'Dane'::"text" NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "text",
    "requested_by_cockpit" "text" NOT NULL,
    CONSTRAINT "orders_priority_check" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Normal'::"text", 'Urgent'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Declined'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "source" "text",
    "notes" "text",
    "stage" "text" DEFAULT 'docs_submitted'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moved_by" "text",
    "purchase_price" numeric,
    "monthly_cash_flow" numeric,
    "dscr" numeric,
    "extracted" "jsonb",
    "origin" "text" DEFAULT 'manual'::"text" NOT NULL,
    "email_message_id" "text",
    "email_from" "text",
    "email_subject" "text",
    "email_received_at" timestamp with time zone,
    "email_excerpt" "text",
    "confirmed" boolean DEFAULT false NOT NULL,
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissed_at" timestamp with time zone,
    "dismissed_by" "text",
    "email_thread_id" "text",
    "address_key" "text",
    "email_count" integer DEFAULT 1 NOT NULL,
    "name_key" "text",
    "bird_dog" "text",
    "pof_amount" numeric,
    "buyer_entity" "text",
    "target_close_date" "date",
    "pof_letter_url" "text",
    "pof_issued_at" timestamp with time zone,
    "pof_issued_by" "text",
    "pof_notes" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "submitter_ip_hash" "text",
    CONSTRAINT "pipeline_deals_birddog_check" CHECK ((("bird_dog" IS NULL) OR ("bird_dog" = ANY (ARRAY['rex'::"text", 'chirag'::"text", 'direct'::"text", 'direct_message'::"text", 'website'::"text", 'underwriting'::"text", 'other'::"text"])))),
    CONSTRAINT "pipeline_deals_origin_check" CHECK (("origin" = ANY (ARRAY['email'::"text", 'manual'::"text", 'website'::"text"]))),
    CONSTRAINT "pipeline_deals_stage_check" CHECK (("stage" = ANY (ARRAY['docs_submitted'::"text", 'underwriting'::"text", 'final_review'::"text", 'proof_of_funds'::"text", 'submit_to_broker'::"text", 'awaiting_signatures'::"text", 'under_contract'::"text", 'funded_emd'::"text", 'due_diligence'::"text", 'coe'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."pipeline_deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_deals_backup_20260823" (
    "id" "uuid",
    "name" "text",
    "address" "text",
    "source" "text",
    "notes" "text",
    "stage" "text",
    "stage_changed_at" timestamp with time zone,
    "moved_by" "text",
    "purchase_price" numeric,
    "monthly_cash_flow" numeric,
    "dscr" numeric,
    "extracted" "jsonb",
    "origin" "text",
    "email_message_id" "text",
    "email_from" "text",
    "email_subject" "text",
    "email_received_at" timestamp with time zone,
    "email_excerpt" "text",
    "confirmed" boolean,
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "dismissed_by" "text",
    "email_thread_id" "text",
    "address_key" "text",
    "email_count" integer,
    "name_key" "text",
    "bird_dog" "text",
    "pof_amount" numeric,
    "buyer_entity" "text",
    "target_close_date" "date",
    "pof_letter_url" "text",
    "pof_issued_at" timestamp with time zone,
    "pof_issued_by" "text",
    "pof_notes" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "submitter_ip_hash" "text"
);


ALTER TABLE "public"."pipeline_deals_backup_20260823" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "cockpit" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_cockpit_check" CHECK (("cockpit" = ANY (ARRAY['raj'::"text", 'dane'::"text", 'jeremiah'::"text", 'colton'::"text", 'zo'::"text", 'karen'::"text", 'rex'::"text", 'ellery'::"text", 'cornelius'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cockpit" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "push_subscriptions_cockpit_check" CHECK (("cockpit" = ANY (ARRAY['raj'::"text", 'dane'::"text", 'karen'::"text", 'jeremiah'::"text", 'colton'::"text", 'zo'::"text"])))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stage_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid",
    "stage" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stage_history_stage_check" CHECK (("stage" = ANY (ARRAY['docs_submitted'::"text", 'underwriting'::"text", 'final_review'::"text", 'proof_of_funds'::"text", 'submit_to_broker'::"text", 'awaiting_signatures'::"text", 'under_contract'::"text", 'funded_emd'::"text", 'due_diligence'::"text", 'coe'::"text", 'dead'::"text"])))
);


ALTER TABLE "public"."stage_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_messages" (
    "message_id" "text" NOT NULL,
    "subscription_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor" "text" NOT NULL,
    "vendor_key" "text",
    "plan" "text",
    "amount" numeric,
    "currency" "text" DEFAULT 'USD'::"text",
    "billing_cycle" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "renews_at" "date",
    "last_paid_at" "date",
    "invoice_url" "text",
    "notes" "text",
    "email_from" "text",
    "email_subject" "text",
    "email_received_at" timestamp with time zone,
    "email_excerpt" "text",
    "email_count" integer DEFAULT 1 NOT NULL,
    "extracted" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'renewal_due'::"text", 'payment_failed'::"text", 'expired'::"text", 'cancelled'::"text", 'trial'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_cockpit" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_comments_author_cockpit_check" CHECK (("author_cockpit" = ANY (ARRAY['raj'::"text", 'dane'::"text", 'karen'::"text", 'jeremiah'::"text", 'colton'::"text", 'zo'::"text"])))
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assigned_to" "text" NOT NULL,
    "created_by" "text" DEFAULT 'raj'::"text" NOT NULL,
    "task_type" "text" DEFAULT 'Task'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "definition_of_done" "text",
    "reference_link" "text",
    "flow_steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "flow_notes" "text",
    "priority" "text" DEFAULT 'Normal'::"text" NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'Not started'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_on" "date",
    "approved_by" "text",
    CONSTRAINT "tasks_assigned_to_check" CHECK (("assigned_to" = ANY (ARRAY['dane'::"text", 'karen'::"text", 'jeremiah'::"text", 'colton'::"text", 'zo'::"text"]))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['Low'::"text", 'Normal'::"text", 'Urgent'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['Not started'::"text", 'In progress'::"text", 'Blocked'::"text", 'Done'::"text"]))),
    CONSTRAINT "tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['Task'::"text", 'Feature'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_inspection_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "photo_set" "text" NOT NULL,
    "room_tag" "text",
    "storage_path" "text" NOT NULL,
    "caption" "text",
    "size_bytes" integer,
    "mime_type" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drive_file_id" "text",
    "drive_error" "text",
    "drive_view_link" "text",
    "drive_folder_id" "text",
    "drive_synced_at" timestamp with time zone,
    CONSTRAINT "unit_inspection_photos_photo_set_check" CHECK (("photo_set" = ANY (ARRAY['condition'::"text", 'marketing'::"text"]))),
    CONSTRAINT "unit_inspection_photos_room_tag_check" CHECK ((("room_tag" IS NULL) OR ("room_tag" = ANY (ARRAY['living'::"text", 'kitchen'::"text", 'bedroom'::"text", 'bathroom'::"text", 'exterior'::"text", 'lot'::"text", 'other'::"text"]))))
);


ALTER TABLE "public"."unit_inspection_photos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."unit_inspection_photos"."drive_error" IS 'Last Drive mirror failure. Supabase is the source of truth; Drive is a copy.';



CREATE TABLE IF NOT EXISTS "public"."unit_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_number" "text" NOT NULL,
    "property" "text" DEFAULT 'Hometown Meadows MHP'::"text" NOT NULL,
    "inspected_by" "uuid",
    "inspected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "beds" integer,
    "baths_full" integer,
    "baths_half" integer,
    "approx_sqft" integer,
    "home_width" "text",
    "appliances" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "systems" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "condition" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occupancy_flags" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occupancy_flagged" boolean GENERATED ALWAYS AS ((COALESCE((("occupancy_flags" ->> 'belongings'::"text"))::boolean, false) OR COALESCE((("occupancy_flags" ->> 'food'::"text"))::boolean, false) OR COALESCE((("occupancy_flags" ->> 'power_on'::"text"))::boolean, false) OR COALESCE((("occupancy_flags" ->> 'water_on'::"text"))::boolean, false) OR COALESCE((("occupancy_flags" ->> 'mail'::"text"))::boolean, false))) STORED,
    "last_tenant" "text",
    "went_empty_approx" "text",
    "keys" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "est_cost_to_ready" numeric(12,2),
    "days_to_ready" integer,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drive_folder_id" "text",
    CONSTRAINT "unit_inspections_status_check" CHECK (("status" = ANY (ARRAY['rent_ready'::"text", 'needs_work'::"text", 'not_habitable'::"text"])))
);


ALTER TABLE "public"."unit_inspections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."unit_inspections"."drive_folder_id" IS 'Drive folder for this unit, created on the first photo mirror.';



ALTER TABLE ONLY "public"."bird_dogs"
    ADD CONSTRAINT "bird_dogs_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."bird_dogs"
    ADD CONSTRAINT "bird_dogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."critical_dates"
    ADD CONSTRAINT "critical_dates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_task_files"
    ADD CONSTRAINT "daily_task_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_task_items"
    ADD CONSTRAINT "daily_task_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_documents"
    ADD CONSTRAINT "deal_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_stages"
    ADD CONSTRAINT "deal_stages_pkey" PRIMARY KEY ("notion_page_id");



ALTER TABLE ONLY "public"."deal_submission_files"
    ADD CONSTRAINT "deal_submission_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_submission_files"
    ADD CONSTRAINT "deal_submission_files_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drive_folders"
    ADD CONSTRAINT "drive_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intake_messages"
    ADD CONSTRAINT "intake_messages_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_deals"
    ADD CONSTRAINT "pipeline_deals_email_message_id_key" UNIQUE ("email_message_id");



ALTER TABLE ONLY "public"."pipeline_deals"
    ADD CONSTRAINT "pipeline_deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_messages"
    ADD CONSTRAINT "subscription_messages_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_inspection_photos"
    ADD CONSTRAINT "unit_inspection_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_inspections"
    ADD CONSTRAINT "unit_inspections_pkey" PRIMARY KEY ("id");



CREATE INDEX "critical_dates_deal_idx" ON "public"."critical_dates" USING "btree" ("deal_id");



CREATE INDEX "critical_dates_due_idx" ON "public"."critical_dates" USING "btree" ("due_on") WHERE ("completed_at" IS NULL);



CREATE INDEX "daily_task_files_assigned_idx" ON "public"."daily_task_files" USING "btree" ("assigned_task_id");



CREATE INDEX "daily_task_files_task_idx" ON "public"."daily_task_files" USING "btree" ("task_id");



CREATE INDEX "daily_task_items_task" ON "public"."daily_task_items" USING "btree" ("task_id", "sort_order");



CREATE INDEX "daily_tasks_completed_on_idx" ON "public"."daily_tasks" USING "btree" ("owner_cockpit", "completed_on" DESC);



CREATE INDEX "daily_tasks_not_deleted" ON "public"."daily_tasks" USING "btree" ("owner_cockpit", "state") WHERE ("deleted_at" IS NULL);



CREATE INDEX "daily_tasks_owner_state_idx" ON "public"."daily_tasks" USING "btree" ("owner_cockpit", "state");



CREATE INDEX "deal_documents_deal_id_idx" ON "public"."deal_documents" USING "btree" ("deal_id");



CREATE INDEX "deal_stages_stage_idx" ON "public"."deal_stages" USING "btree" ("stage");



CREATE INDEX "deal_submission_files_deal_idx" ON "public"."deal_submission_files" USING "btree" ("deal_id");



CREATE INDEX "deal_submission_files_ip_idx" ON "public"."deal_submission_files" USING "btree" ("submitter_ip_hash", "created_at" DESC);



CREATE INDEX "deal_submission_files_token_idx" ON "public"."deal_submission_files" USING "btree" ("submission_token");



CREATE INDEX "deals_stage_idx" ON "public"."deals" USING "btree" ("stage");



CREATE INDEX "documents_deal_idx" ON "public"."documents" USING "btree" ("deal_id");



CREATE INDEX "documents_due_idx" ON "public"."documents" USING "btree" ("due_on");



CREATE INDEX "documents_stage_idx" ON "public"."documents" USING "btree" ("stage", "stage_changed_at" DESC);



CREATE INDEX "leads_created_idx" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE INDEX "leads_stage_idx" ON "public"."leads" USING "btree" ("stage");



CREATE INDEX "notifications_recipient_idx" ON "public"."notifications" USING "btree" ("recipient", "read_at", "created_at" DESC);



CREATE INDEX "orders_requested_by_cockpit_idx" ON "public"."orders" USING "btree" ("requested_by_cockpit");



CREATE INDEX "orders_status_created_idx" ON "public"."orders" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "pipeline_deals_addresskey_idx" ON "public"."pipeline_deals" USING "btree" ("address_key");



CREATE INDEX "pipeline_deals_birddog_idx" ON "public"."pipeline_deals" USING "btree" ("bird_dog") WHERE ("confirmed" = true);



CREATE INDEX "pipeline_deals_namekey_idx" ON "public"."pipeline_deals" USING "btree" ("name_key");



CREATE INDEX "pipeline_deals_pending_idx" ON "public"."pipeline_deals" USING "btree" ("created_at" DESC) WHERE (("confirmed" = false) AND ("dismissed_at" IS NULL));



CREATE INDEX "pipeline_deals_pof_idx" ON "public"."pipeline_deals" USING "btree" ("stage") WHERE (("stage" = 'proof_of_funds'::"text") AND ("confirmed" = true));



CREATE INDEX "pipeline_deals_review_idx" ON "public"."pipeline_deals" USING "btree" ("confirmed", "created_at" DESC);



CREATE INDEX "pipeline_deals_stage_idx" ON "public"."pipeline_deals" USING "btree" ("stage");



CREATE INDEX "pipeline_deals_submitter_idx" ON "public"."pipeline_deals" USING "btree" ("submitter_ip_hash", "created_at" DESC) WHERE ("origin" = 'website'::"text");



CREATE INDEX "pipeline_deals_thread_idx" ON "public"."pipeline_deals" USING "btree" ("email_thread_id");



CREATE INDEX "push_subs_cockpit_idx" ON "public"."push_subscriptions" USING "btree" ("cockpit");



CREATE INDEX "subscriptions_status_idx" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "subscriptions_vendorkey_idx" ON "public"."subscriptions" USING "btree" ("vendor_key");



CREATE UNIQUE INDEX "subscriptions_vendorkey_unique" ON "public"."subscriptions" USING "btree" ("vendor_key");



CREATE INDEX "task_comments_task_idx" ON "public"."task_comments" USING "btree" ("task_id", "created_at");



CREATE INDEX "tasks_approved_on_idx" ON "public"."tasks" USING "btree" ("assigned_to", "approved_on" DESC);



CREATE INDEX "tasks_assigned_idx" ON "public"."tasks" USING "btree" ("assigned_to", "status", "created_at" DESC);



CREATE INDEX "unit_inspection_photos_parent" ON "public"."unit_inspection_photos" USING "btree" ("inspection_id", "photo_set");



CREATE INDEX "unit_inspection_photos_unsynced" ON "public"."unit_inspection_photos" USING "btree" ("inspection_id") WHERE ("drive_file_id" IS NULL);



CREATE INDEX "unit_inspections_by_walker" ON "public"."unit_inspections" USING "btree" ("inspected_by", "inspected_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "unit_inspections_occupied" ON "public"."unit_inspections" USING "btree" ("inspected_at" DESC) WHERE ("occupancy_flagged" AND ("deleted_at" IS NULL));



CREATE INDEX "unit_inspections_recent" ON "public"."unit_inspections" USING "btree" ("property", "inspected_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "unit_inspections_status" ON "public"."unit_inspections" USING "btree" ("status") WHERE ("deleted_at" IS NULL);



ALTER TABLE ONLY "public"."critical_dates"
    ADD CONSTRAINT "critical_dates_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_task_files"
    ADD CONSTRAINT "daily_task_files_assigned_task_id_fkey" FOREIGN KEY ("assigned_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_task_files"
    ADD CONSTRAINT "daily_task_files_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."daily_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_task_items"
    ADD CONSTRAINT "daily_task_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."daily_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_documents"
    ADD CONSTRAINT "deal_documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_submission_files"
    ADD CONSTRAINT "deal_submission_files_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_bird_dog_id_fkey" FOREIGN KEY ("bird_dog_id") REFERENCES "public"."bird_dogs"("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drive_folders"
    ADD CONSTRAINT "drive_folders_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_documents"
    ADD CONSTRAINT "generated_documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intake_messages"
    ADD CONSTRAINT "intake_messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_history"
    ADD CONSTRAINT "stage_history_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_messages"
    ADD CONSTRAINT "subscription_messages_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_inspection_photos"
    ADD CONSTRAINT "unit_inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."unit_inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_inspections"
    ADD CONSTRAINT "unit_inspections_inspected_by_fkey" FOREIGN KEY ("inspected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."bird_dogs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."critical_dates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_task_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_task_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_submission_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_submission_files_backup_20260823" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drive_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intake_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intake_messages_backup_20260823" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_deals_backup_20260823" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."stage_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_inspection_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_inspections" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."bird_dogs" TO "anon";
GRANT ALL ON TABLE "public"."bird_dogs" TO "authenticated";
GRANT ALL ON TABLE "public"."bird_dogs" TO "service_role";



GRANT ALL ON TABLE "public"."critical_dates" TO "anon";
GRANT ALL ON TABLE "public"."critical_dates" TO "authenticated";
GRANT ALL ON TABLE "public"."critical_dates" TO "service_role";



GRANT ALL ON TABLE "public"."daily_task_files" TO "anon";
GRANT ALL ON TABLE "public"."daily_task_files" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_task_files" TO "service_role";



GRANT ALL ON TABLE "public"."daily_task_items" TO "anon";
GRANT ALL ON TABLE "public"."daily_task_items" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_task_items" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tasks" TO "anon";
GRANT ALL ON TABLE "public"."daily_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."deal_documents" TO "anon";
GRANT ALL ON TABLE "public"."deal_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_documents" TO "service_role";



GRANT ALL ON TABLE "public"."deal_stages" TO "anon";
GRANT ALL ON TABLE "public"."deal_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_stages" TO "service_role";



GRANT ALL ON TABLE "public"."deal_submission_files" TO "anon";
GRANT ALL ON TABLE "public"."deal_submission_files" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_submission_files" TO "service_role";



GRANT ALL ON TABLE "public"."deal_submission_files_backup_20260823" TO "anon";
GRANT ALL ON TABLE "public"."deal_submission_files_backup_20260823" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_submission_files_backup_20260823" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."drive_folders" TO "anon";
GRANT ALL ON TABLE "public"."drive_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."drive_folders" TO "service_role";



GRANT ALL ON TABLE "public"."generated_documents" TO "anon";
GRANT ALL ON TABLE "public"."generated_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_documents" TO "service_role";



GRANT ALL ON TABLE "public"."intake_messages" TO "anon";
GRANT ALL ON TABLE "public"."intake_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_messages" TO "service_role";



GRANT ALL ON TABLE "public"."intake_messages_backup_20260823" TO "anon";
GRANT ALL ON TABLE "public"."intake_messages_backup_20260823" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_messages_backup_20260823" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_deals" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_deals" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_deals" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_deals_backup_20260823" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_deals_backup_20260823" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_deals_backup_20260823" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."stage_history" TO "anon";
GRANT ALL ON TABLE "public"."stage_history" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_history" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_messages" TO "anon";
GRANT ALL ON TABLE "public"."subscription_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_messages" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."task_comments" TO "anon";
GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."task_comments" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."unit_inspection_photos" TO "anon";
GRANT ALL ON TABLE "public"."unit_inspection_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_inspection_photos" TO "service_role";



GRANT ALL ON TABLE "public"."unit_inspections" TO "anon";
GRANT ALL ON TABLE "public"."unit_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_inspections" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































