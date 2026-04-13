--
-- PostgreSQL database dump
--

\restrict ZDebDWbgD4iRuzideB3nef6vBV6ktJYhr1So2ndgDMMYu0VEpqCbstZBdYFNFH0

-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type AS ENUM (
    'cash',
    'checking',
    'savings',
    'credit_card'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'income',
    'expense'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: balance_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.balance_snapshot (
    id text NOT NULL,
    workspace_id text NOT NULL,
    financial_account_id text NOT NULL,
    effective_date date NOT NULL,
    amount_minor_raw bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: budget_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_item (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    amount_minor bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: financial_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_account (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    institution_name text,
    type public.account_type NOT NULL,
    archived_at timestamp with time zone,
    archived_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: financial_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_transaction (
    id text NOT NULL,
    workspace_id text NOT NULL,
    financial_account_id text NOT NULL,
    name text NOT NULL,
    type public.transaction_type NOT NULL,
    amount_minor bigint NOT NULL,
    transaction_date date NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: recurring_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_transaction (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    financial_account_id text,
    type public.transaction_type NOT NULL,
    amount_minor bigint NOT NULL,
    day_of_month integer NOT NULL,
    archived_at timestamp with time zone,
    archived_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    google_sub text
);


--
-- Name: user_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace (
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: workspace_membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_membership (
    id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_user_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id text NOT NULL
);


--
-- Name: balance_snapshot balance_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_snapshot
    ADD CONSTRAINT balance_snapshot_pkey PRIMARY KEY (id);


--
-- Name: budget_item budget_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_item
    ADD CONSTRAINT budget_item_pkey PRIMARY KEY (id);


--
-- Name: financial_account financial_account_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_account
    ADD CONSTRAINT financial_account_id_workspace_unique UNIQUE (id, workspace_id);


--
-- Name: financial_account financial_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_account
    ADD CONSTRAINT financial_account_pkey PRIMARY KEY (id);


--
-- Name: financial_transaction financial_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transaction
    ADD CONSTRAINT financial_transaction_pkey PRIMARY KEY (id);


--
-- Name: recurring_transaction recurring_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_transaction
    ADD CONSTRAINT recurring_transaction_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: user_account user_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_pkey PRIMARY KEY (id);


--
-- Name: user_account user_account_provider_account_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_provider_account_unique UNIQUE (provider_id, account_id);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: workspace_membership workspace_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_pkey PRIMARY KEY (id);


--
-- Name: workspace workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_pkey PRIMARY KEY (id);


--
-- Name: balance_snapshot_account_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_snapshot_account_date_idx ON public.balance_snapshot USING btree (financial_account_id, effective_date DESC, created_at DESC, id DESC);


--
-- Name: balance_snapshot_workspace_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX balance_snapshot_workspace_date_idx ON public.balance_snapshot USING btree (workspace_id, effective_date DESC);


--
-- Name: budget_item_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX budget_item_workspace_idx ON public.budget_item USING btree (workspace_id);


--
-- Name: financial_account_workspace_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_account_workspace_active_idx ON public.financial_account USING btree (workspace_id) WHERE (archived_at IS NULL);


--
-- Name: financial_account_workspace_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX financial_account_workspace_name_unique ON public.financial_account USING btree (workspace_id, lower(name));


--
-- Name: financial_transaction_workspace_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_transaction_workspace_date_idx ON public.financial_transaction USING btree (workspace_id, transaction_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: recurring_transaction_workspace_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recurring_transaction_workspace_active_idx ON public.recurring_transaction USING btree (workspace_id) WHERE (archived_at IS NULL);


--
-- Name: session_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_user_id_idx ON public.session USING btree (user_id);


--
-- Name: user_account_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_account_user_id_idx ON public.user_account USING btree (user_id);


--
-- Name: user_email_ci_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_email_ci_unique ON public."user" USING btree (lower(email));


--
-- Name: user_google_sub_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_google_sub_unique ON public."user" USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: workspace_membership_workspace_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_membership_workspace_user_unique ON public.workspace_membership USING btree (workspace_id, user_id) WHERE (deleted_at IS NULL);


--
-- Name: balance_snapshot balance_snapshot_account_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_snapshot
    ADD CONSTRAINT balance_snapshot_account_workspace_fk FOREIGN KEY (financial_account_id, workspace_id) REFERENCES public.financial_account(id, workspace_id);


--
-- Name: balance_snapshot balance_snapshot_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.balance_snapshot
    ADD CONSTRAINT balance_snapshot_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- Name: budget_item budget_item_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_item
    ADD CONSTRAINT budget_item_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- Name: financial_account financial_account_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_account
    ADD CONSTRAINT financial_account_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- Name: financial_transaction financial_transaction_account_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transaction
    ADD CONSTRAINT financial_transaction_account_workspace_fk FOREIGN KEY (financial_account_id, workspace_id) REFERENCES public.financial_account(id, workspace_id);


--
-- Name: financial_transaction financial_transaction_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transaction
    ADD CONSTRAINT financial_transaction_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- Name: recurring_transaction recurring_transaction_account_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_transaction
    ADD CONSTRAINT recurring_transaction_account_workspace_fk FOREIGN KEY (financial_account_id, workspace_id) REFERENCES public.financial_account(id, workspace_id);


--
-- Name: recurring_transaction recurring_transaction_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_transaction
    ADD CONSTRAINT recurring_transaction_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- Name: session session_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_account user_account_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_account
    ADD CONSTRAINT user_account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: workspace_membership workspace_membership_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: workspace_membership workspace_membership_workspace_id_workspace_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_workspace_id_workspace_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ZDebDWbgD4iRuzideB3nef6vBV6ktJYhr1So2ndgDMMYu0VEpqCbstZBdYFNFH0

