-- SQL Migration to create the invites table and set up RLS
-- Run this in the Supabase SQL Editor

-- 1. Create the invites table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id UUID REFERENCES auth.users(id) NOT NULL,
    receiver_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    trigger_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
    transport_mode TEXT DEFAULT 'car' CHECK (transport_mode IN ('car', 'foot', 'bus')),
    estimated_time INTEGER DEFAULT 15,
    ai_reminder_call JSONB DEFAULT '{"enabled": false, "interval": "day"}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies
-- Users can see invites where they are either the sender or the receiver
CREATE POLICY "Users can view their own invites" 
ON public.invites FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can insert invites where they are the sender
CREATE POLICY "Users can create their own invites" 
ON public.invites FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Users can update invites where they are either the sender (to cancel/edit) or receiver (to accept/reject)
CREATE POLICY "Users can update their own invites" 
ON public.invites FOR UPDATE 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. Expose the table to the API
-- If this table was just created, sometimes PostgREST needs a cache reload.
-- This can be done by making a change to the schema or restarting the project,
-- but usually creating the table is enough.
NOTIFY pgrst, 'reload schema';
