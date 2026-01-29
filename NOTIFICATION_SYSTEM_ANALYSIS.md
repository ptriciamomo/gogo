# Notification System Analysis (Function-Level Explanation)

## Entry Points

### Functions Responsible for Creating Notifications

**1. Client-Side Notification Services (In-Memory Only)**
- **`GlobalNotificationService.notifyTaskApproval()`** (`services/GlobalNotificationService.ts:63`)
  - Creates task approval notifications (client-side only, no database)
  - Called from: `app/buddycaller/task_progress.tsx:650` and `app/buddycaller/task_progress_web.tsx:691`
  
- **`ApprovalModalService.notifyApproval()`** (`services/ApprovalModalService.ts:37`)
  - Duplicate service for task approval notifications (redundancy mechanism)
  - Called from same locations as above

- **`ErrandCompletionService.notifyCompletion()`** (`services/ErrandCompletionService.ts:38`)
  - Creates errand completion notifications (client-side only)
  - Called from: `app/buddycaller/_layout.tsx:128,160`

- **`ErrandAcceptanceService.notifyAcceptance()`** (`services/ErrandAcceptanceService.ts:38`)
  - Creates errand acceptance notifications (client-side only)
  - Called from: `app/buddycaller/_layout.tsx:217,265`

- **`InvoiceAcceptanceService`** (`services/InvoiceAcceptanceService.ts:41-220`)
  - Listens for invoice acceptance via realtime subscription to `messages` table
  - Notifies subscribers when message text equals "Invoice accepted by caller"

- **`CallerErrandRatingService.notifyRating()`** (`services/CallerErrandRatingService.ts:40`)
  - Creates caller errand rating notifications (client-side only)

- **`NoRunnersAvailableService.notify()`** (`services/NoRunnersAvailableService.ts:22`)
  - Creates "no runners available" notifications (client-side only)

**2. Database Functions (Notification Tracking, Not Creation)**
- **`update_errand_notification()`** (`add_errand_notification_functions.sql:5`)
  - Updates `errand.notified_runner_id`, `notified_at`, `timeout_runner_ids`
  - Does NOT create notifications table records
  - Called via RPC: `supabase.rpc('update_errand_notification', ...)`

- **`clear_errand_notification()`** (`add_errand_notification_functions.sql:42`)
  - Clears errand notification tracking fields
  - Does NOT create notifications table records

**3. Database Table Subscriptions (Notification Detection)**
- **Commission INSERT listener** (`app/buddyrunner/notification.tsx:613-703`)
  - Listens for new `commission` table INSERTs
  - Creates in-memory notification objects (not database records)
  - Channel: `runner_notifications` (mobile) / `runner_notifications_web` (web)

- **Notifications table INSERT listener** (`services/GlobalNotificationService.ts:153-184`)
  - Listens for `notifications` table INSERTs with `type=eq.task_completion`
  - Channel: `task_completion_notifications`

- **Notifications table INSERT listener (approval)** (`services/GlobalNotificationService.ts:202-226`)
  - Listens for `notifications` table INSERTs with `type=eq.task_approval`
  - Channel: `task_approval_notifications`

### Where Notifications Are First Triggered

**Client-Side Actions:**
1. **Task Approval** → `app/buddycaller/task_progress.tsx:569` (`handleConfirmApproval`)
   - Updates `commission.status` to 'completed'
   - Updates `task_progress.status` to 'completed'
   - Calls `globalNotificationService.notifyTaskApproval()` and `approvalModalService.notifyApproval()`
   - Broadcasts via Supabase realtime: `task_approvals_${runner.id}` channel

2. **Commission Created** → Database INSERT triggers realtime subscription
   - `app/buddyrunner/notification.tsx:613-703` listens for commission INSERTs
   - Creates in-memory notification objects

3. **Errand Completed** → `app/buddyrunner/task_progress.tsx` (status update)
   - Updates errand status to 'completed'
   - Broadcasts via Supabase realtime: `errand_completion_${callerId}` channel
   - Database UPDATE triggers listener in `app/buddycaller/_layout.tsx:140-170`

4. **Errand Accepted** → Runner accepts errand
   - Updates errand status to 'in_progress'
   - Broadcasts via Supabase realtime: `errand_acceptance_${callerId}` channel
   - Database UPDATE triggers listener in `app/buddycaller/_layout.tsx:232-278`

**Database Triggers:**
- **Not implemented / No handler found** - No database triggers found that INSERT into `notifications` table

**Edge Functions:**
- **Not implemented / No handler found** - No edge functions found that create notifications

**Realtime Listeners:**
- Multiple Supabase realtime subscriptions listen for database changes and create in-memory notifications

---

## Trigger Conditions

### Exact Events That Cause Notifications

**1. Commission Posted (Runner Notification)**
- **Event:** INSERT into `commission` table with `status='pending'`
- **Handler:** `app/buddyrunner/notification.tsx:622-703`
- **Conditions:**
  - Runner must be `is_available=true`
  - Runner must have `latitude` and `longitude`
  - Runner must NOT be in `declined_runner_id`
  - Distance between runner and caller ≤ 500 meters
  - Commission must have `status='pending'`
  - Ranking logic applies (see notification.tsx:409-546)

**2. Task Approval (Runner Notification)**
- **Event:** Caller approves task completion
- **Handler:** `app/buddycaller/task_progress.tsx:569` → `globalNotificationService.notifyTaskApproval()`
- **Conditions:**
  - Commission status changes to 'completed'
  - Task progress status changes to 'completed'
  - Notification sent via 3 mechanisms:
    1. `GlobalNotificationService.notifyTaskApproval()`
    2. `ApprovalModalService.notifyApproval()`
    3. Supabase realtime broadcast: `task_approvals_${runner.id}`

**3. Task Completion (Caller Notification)**
- **Event:** INSERT into `notifications` table with `type='task_completion'`
- **Handler:** `services/GlobalNotificationService.ts:163-184`
- **Conditions:**
  - Notification `user_id` matches current user
  - Notification `type` equals 'task_completion'
- **Note:** The INSERT into notifications table is NOT found in codebase - likely via database trigger or edge function

**4. Errand Completion (Caller Notification)**
- **Event:** UPDATE `errand` table where `status` changes to 'completed'
- **Handler:** `app/buddycaller/_layout.tsx:140-170`
- **Conditions:**
  - Errand `buddycaller_id` matches current user
  - Status changes from non-'completed' to 'completed'
  - Broadcast also sent: `errand_completion_${callerId}` channel

**5. Errand Acceptance (Caller Notification)**
- **Event:** UPDATE `errand` table where `status` changes to 'in_progress'
- **Handler:** `app/buddycaller/_layout.tsx:232-278`
- **Conditions:**
  - Errand `buddycaller_id` matches current user
  - Status changes from non-'in_progress' to 'in_progress'
  - Broadcast also sent: `errand_acceptance_${callerId}` channel

**6. Invoice Acceptance (Runner Notification)**
- **Event:** INSERT into `messages` table where `message_text='Invoice accepted by caller'`
- **Handler:** `services/InvoiceAcceptanceService.ts:60-209`
- **Conditions:**
  - Current user is the runner in the conversation
  - Message text exactly equals "Invoice accepted by caller"

**7. Warning Notifications**
- **Event:** INSERT into `notifications` table with `type='warning'`
- **Handler:** `app/buddyrunner/notification.tsx:324-331` and `app/buddycaller/notification.tsx:307-313`
- **Conditions:**
  - Notification `user_id` matches current user
  - Notification `type` equals 'warning'
- **Note:** The INSERT into notifications table is NOT found in codebase - likely via database trigger or edge function

**8. Commission Status Change (Runner Notification Removal)**
- **Event:** UPDATE `commission` table where status changes from 'pending' to non-'pending'
- **Handler:** `app/buddyrunner/notification.tsx:712-722`
- **Action:** Removes notification from UI (does not mark as read in database)

**9. Timeout/Ignore (Commission Re-queuing)**
- **Event:** 60 seconds pass since `notified_at` timestamp
- **Handler:** `app/buddyrunner/notification.tsx:532-546` (ranking logic)
- **Action:** Re-assigns commission to next eligible runner via `update_commission_notification` RPC

---

## Notification Creation Logic

### Functions That Write Notification Records

**Database Table: `notifications`**
- **Not implemented / No handler found** - No client-side code found that INSERTs into `notifications` table
- **Expected fields** (based on queries):
  - `id` (primary key)
  - `user_id` (UUID, foreign key to users)
  - `type` (enum: 'task_completion', 'task_approval', 'warning')
  - `title` (string)
  - `message` (string, used as `body` in UI)
  - `data` (JSONB, stores structured notification data)
  - `is_read` (boolean)
  - `created_at` (timestamptz)

**In-Memory Notification Objects:**
- Created by various services but NOT persisted to database
- Stored in service singletons' `currentNotification` properties
- Examples:
  - `TaskCompletionNotification` interface (`services/GlobalNotificationService.ts:3-11`)
  - `TaskApprovalNotification` interface (`services/GlobalNotificationService.ts:13-21`)
  - `ErrandCompletionNotification` interface (`services/ErrandCompletionService.ts:1-4`)

**Commission-Based Notifications (Not Stored in Database):**
- Created from `commission` table records
- Function: `createNotificationFromCommission()` (`app/buddyrunner/notification.tsx:63-73`)
- Fields: `id`, `title`, `body`, `avatar`, `created_at`, `commission_id`, `caller_name`

---

## Delivery Mechanism

### How Notifications Are Delivered

**1. Supabase Realtime Subscriptions**

**Runner Mobile App:**
- **Commission notifications:** `app/buddyrunner/notification.tsx:613-703`
  - Channel: `runner_notifications`
  - Listens: `commission` table INSERT events
  - Filter: `status='pending'`
  
- **Task completion:** `services/GlobalNotificationService.ts:153-184`
  - Channel: `task_completion_notifications`
  - Listens: `notifications` table INSERT events
  - Filter: `type=eq.task_completion`
  
- **Task approval:** `services/GlobalNotificationService.ts:202-226`
  - Channel: `task_approval_notifications`
  - Listens: `notifications` table INSERT events
  - Filter: `type=eq.task_approval`
  
- **Task approval (broadcast):** `app/buddyrunner/_layout.tsx:209-222`
  - Channel: `task_approvals_${currentUserId}`
  - Listens: Broadcast events with `event='task_approval'`

**Runner Web App:**
- Same subscriptions as mobile, but channel name: `runner_notifications_web`

**Caller Mobile/Web App:**
- **Errand completion:** `app/buddycaller/_layout.tsx:120-137` (broadcast) and `140-170` (database)
  - Broadcast channel: `errand_completion_${userId}`
  - Database channel: `errand_completion_db_${userId}`
  - Listens: `errand` table UPDATE events
  
- **Errand acceptance:** `app/buddycaller/_layout.tsx:209-226` (broadcast) and `232-278` (database)
  - Broadcast channel: `errand_acceptance_${userId}`
  - Database channel: `errand_acceptance_db_${userId}`
  - Listens: `errand` table UPDATE events

**Invoice acceptance:** `services/InvoiceAcceptanceService.ts:54-214`
- Channel: `invoice_acceptance_global`
- Listens: `messages` table INSERT events

**2. Push Notifications**
- **Not implemented / No handler found** - No push notification code found

**3. Polling**
- **Not implemented / No handler found** - No polling mechanism found
- Notifications are loaded on mount and via realtime subscriptions

**4. In-Memory Service Subscriptions**
- Multiple services use observer pattern:
  - `GlobalNotificationService.subscribe()` (`services/GlobalNotificationService.ts:30`)
  - `ApprovalModalService.subscribe()` (`services/ApprovalModalService.ts:20`)
  - `ErrandCompletionService.subscribe()` (`services/ErrandCompletionService.ts:21`)
  - `ErrandAcceptanceService.subscribe()` (`services/ErrandAcceptanceService.ts:21`)
  - `InvoiceAcceptanceService.subscribe()` (`services/InvoiceAcceptanceService.ts:18`)
  - `CallerErrandRatingService.subscribe()` (`services/CallerErrandRatingService.ts:23`)
  - `NoRunnersAvailableService.subscribe()` (`services/NoRunnersAvailableService.ts:14`)

---

## Role-Based Behavior

### How System Differentiates Notifications by Role

**Runners:**
- **Commission notifications:** Filtered by:
  - `is_available=true` (`app/buddyrunner/notification.tsx:646`)
  - Has location (`app/buddyrunner/notification.tsx:651`)
  - Distance ≤ 500m (`app/buddyrunner/notification.tsx:684`)
  - Not declined (`app/buddyrunner/notification.tsx:657`)
  - Ranking logic applies (`app/buddyrunner/notification.tsx:409-546`)
  
- **Task approval notifications:** Sent to runner via:
  - `runnerId` field in notification object (`app/buddycaller/task_progress.tsx:640`)
  - Runner-specific broadcast channel: `task_approvals_${runner.id}` (`app/buddycaller/task_progress.tsx:655`)
  
- **Invoice acceptance:** Filtered by role check (`services/InvoiceAcceptanceService.ts:159-176`)
  - Only shown if current user is runner in conversation

**Callers:**
- **Errand completion:** Filtered by:
  - `buddycaller_id` matches current user (`app/buddycaller/_layout.tsx:148`)
  
- **Errand acceptance:** Filtered by:
  - `buddycaller_id` matches current user (`app/buddycaller/_layout.tsx:240`)
  
- **Warning notifications:** Filtered by:
  - `user_id` matches current user (`app/buddycaller/notification.tsx:310`)

**Admins:**
- **Not implemented / No handler found** - No admin-specific notification handlers found

**Role Handling:**
- Role is determined via `users.role` column
- Filtering happens via:
  1. Database queries with `user_id` filters
  2. Realtime subscription filters (`buddycaller_id=eq.${userId}`)
  3. Client-side checks after receiving notifications

---

## Read / Seen State

### Functions That Mark Notifications as Read

**1. Warning Notifications:**
- **Function:** `onMarkAsRead()` (`app/buddyrunner/notification.tsx:833-836`)
- **Action:** Removes notification from UI state only
- **Database:** **Not implemented / No handler found** - No UPDATE to `notifications.is_read` found
- **When:** User clicks delete button on notification

**2. Commission Notifications:**
- **Not implemented / No handler found** - No read state tracking for commission notifications
- Notifications are removed from UI when commission status changes (`app/buddyrunner/notification.tsx:718-720`)

**3. Task Completion/Approval Notifications:**
- **Not implemented / No handler found** - No read state tracking
- Modals are dismissed but no database update occurs

**4. Conversation Read State (Messages):**
- **Function:** `markConversationAsRead()` (`app/buddyrunner/messages_list.tsx:80-95`)
- **Action:** Stores read state in AsyncStorage (client-side only)
- **Database:** **Not implemented / No handler found** - No database update

**Summary:**
- **Read state is NOT persisted to database** - All read/seen tracking is client-side only (UI state or AsyncStorage)
- No `UPDATE notifications SET is_read=true` queries found in codebase

---

## Error Handling & Safeguards

### What Happens If Notification Creation Fails

**1. Realtime Subscription Failures:**
- **Handler:** `services/GlobalNotificationService.ts:186-198`
- **Action:** Logs warning, continues execution
- **Fallback:** None - notification is lost if subscription fails

**2. Broadcast Failures:**
- **Handler:** `app/buddycaller/task_progress.tsx:660-662` (try-catch around broadcast)
- **Action:** Logs warning, continues execution
- **Fallback:** Multiple delivery mechanisms (GlobalNotificationService + ApprovalModalService + broadcast)

**3. Service Notification Failures:**
- **Handler:** `services/ApprovalModalService.ts:52-57` (try-catch around listener callbacks)
- **Action:** Logs error for specific listener, continues to next listener
- **Fallback:** None - failed listener doesn't receive notification

**4. Database Query Failures:**
- **Handler:** `app/buddyrunner/notification.tsx:317-319` (error logging)
- **Action:** Logs error, returns early (no notifications loaded)
- **Fallback:** None - user sees empty notification list

**5. User Authentication Failures:**
- **Handler:** `app/buddyrunner/notification.tsx:633-637`
- **Action:** Returns early, skips notification processing
- **Fallback:** None - notification is skipped

**6. Location/Distance Check Failures:**
- **Handler:** `app/buddyrunner/notification.tsx:651-654`
- **Action:** Skips notification if runner has no location
- **Fallback:** Falls back to database location if GPS fails (`app/buddyrunner/notification.tsx:273-293`)

**Retries:**
- **Not implemented / No handler found** - No retry logic for failed notifications

**Fallbacks:**
- **Task approval:** Triple delivery (GlobalNotificationService + ApprovalModalService + broadcast)
- **Errand completion:** Dual delivery (broadcast + database subscription)
- **Errand acceptance:** Dual delivery (broadcast + database subscription)

**Silent Failures:**
- Most failures are logged but do not alert the user
- Notifications may be silently dropped if:
  - User is offline
  - Subscription fails
  - Authentication fails
  - Location check fails

---

## Redundancy & Risks

### Duplicate Notification Triggers

**1. Task Approval Notifications (TRIPLE DELIVERY):**
- **Location 1:** `app/buddycaller/task_progress.tsx:650` → `globalNotificationService.notifyTaskApproval()`
- **Location 2:** `app/buddycaller/task_progress.tsx:651` → `approvalModalService.notifyApproval()`
- **Location 3:** `app/buddycaller/task_progress.tsx:654-660` → Supabase broadcast `task_approvals_${runner.id}`
- **Risk:** Runner may receive same notification 3 times
- **Mitigation:** `SimpleTaskApprovalModal` likely deduplicates (not verified in code)

**2. Errand Completion Notifications (DUAL DELIVERY):**
- **Location 1:** Broadcast channel `errand_completion_${userId}` (`app/buddycaller/_layout.tsx:120-137`)
- **Location 2:** Database subscription `errand_completion_db_${userId}` (`app/buddycaller/_layout.tsx:140-170`)
- **Risk:** Caller may receive duplicate notifications
- **Mitigation:** `processedErrandsRef` Set tracks processed errand IDs (`app/buddycaller/_layout.tsx:98,126-127`)

**3. Errand Acceptance Notifications (DUAL DELIVERY):**
- **Location 1:** Broadcast channel `errand_acceptance_${userId}` (`app/buddycaller/_layout.tsx:209-226`)
- **Location 2:** Database subscription `errand_acceptance_db_${userId}` (`app/buddycaller/_layout.tsx:232-278`)
- **Risk:** Caller may receive duplicate notifications
- **Mitigation:** `processedAcceptancesRef` Set tracks processed errand IDs (`app/buddycaller/_layout.tsx:100,215-216`)

**4. Commission Notifications (DUAL SUBSCRIPTION):**
- **Location 1:** Mobile subscription `runner_notifications` (`app/buddyrunner/notification.tsx:613`)
- **Location 2:** Web subscription `runner_notifications_web` (`app/buddyrunner/notification.tsx:1523`)
- **Risk:** Low - only one subscription active per platform
- **Mitigation:** Platform detection (`Platform.OS === "web"`)

**5. GlobalNotificationService Approval Bridge:**
- **Location:** `app/buddyrunner/_layout.tsx:190-196`
- **Action:** Forwards GlobalNotificationService approvals to ApprovalModalService
- **Risk:** May cause duplicate if approval already sent via ApprovalModalService
- **Mitigation:** None - relies on modal deduplication

**Multiple Functions Firing for Same Event:**
- **Commission INSERT:** Triggers realtime subscription → creates notification object
- **Commission UPDATE:** Triggers realtime subscription → removes notification from UI
- **Task approval:** Updates database → sends 3 notifications → may trigger database subscription if notifications table INSERT occurs

**Notifications Sent More Than Once:**
- **High Risk:** Task approval notifications (3 delivery mechanisms)
- **Medium Risk:** Errand completion/acceptance (2 delivery mechanisms with deduplication)
- **Low Risk:** Commission notifications (single subscription per platform)

---

## Performance & Cleanup

### Old Notification Cleanup

**1. Database Cleanup:**
- **Not implemented / No handler found** - No cleanup/archival functions found
- **Not implemented / No handler found** - No scheduled jobs to delete old notifications

**2. In-Memory Cleanup:**
- **Service cleanup:** `clearNotification()` methods exist but only clear current notification:
  - `GlobalNotificationService.clearNotification()` (`services/GlobalNotificationService.ts:44`)
  - `ApprovalModalService.clearNotification()` (`services/ApprovalModalService.ts:63`)
  - `ErrandCompletionService.clearNotification()` (`services/ErrandCompletionService.ts:61`)
- **Subscription cleanup:** Channels are removed on component unmount:
  - `app/buddyrunner/notification.tsx:728-730` (mobile)
  - `app/buddyrunner/notification.tsx:1633-1636` (web)
  - `app/buddyrunner/_layout.tsx:238-249` (approval subscriptions)

**3. UI State Cleanup:**
- **Commission notifications:** Removed when status changes (`app/buddyrunner/notification.tsx:718-720`)
- **Warning notifications:** Removed on delete (`app/buddyrunner/notification.tsx:835`)
- **No limit:** Notifications list has no maximum size limit

**Unnecessary Re-renders:**
- **Potential issue:** `loadNotifications()` called on every focus (`app/buddyrunner/notification.tsx:734-815`)
- **Potential issue:** Realtime subscriptions may trigger re-renders on every database change
- **Mitigation:** React.useCallback used for `loadNotifications` (`app/buddyrunner/notification.tsx:188`)

**Repeated Subscriptions:**
- **Potential issue:** Multiple components may subscribe to same service
- **Mitigation:** Services use singleton pattern (ApprovalModalService, ErrandCompletionService, etc.)
- **Risk:** If component unmounts without cleanup, subscriptions may leak

**Performance Concerns:**
- **Distance calculations:** Performed for every commission on every load (`app/buddyrunner/notification.tsx:379-384`)
- **Ranking logic:** Async operations in filter function (`app/buddyrunner/notification.tsx:369-547`)
- **GPS location:** Retries up to 3 times with delays (`app/buddyrunner/notification.tsx:219-270`)

---

## Summary

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ EVENT OCCURS                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TRIGGER CONDITION CHECK                                         │
│ - User role/availability                                        │
│ - Distance/location                                             │
│ - Status changes                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATION CREATION                                            │
│                                                                  │
│ Type 1: Database INSERT (notifications table)                  │
│   └─> NOT FOUND IN CODEBASE (likely database trigger)          │
│                                                                  │
│ Type 2: In-Memory Service                                       │
│   └─> GlobalNotificationService.notifyTaskApproval()            │
│   └─> ApprovalModalService.notifyApproval()                     │
│   └─> ErrandCompletionService.notifyCompletion()                │
│                                                                  │
│ Type 3: Realtime Broadcast                                      │
│   └─> supabase.channel().send({ type: 'broadcast' })            │
│                                                                  │
│ Type 4: Commission Object Conversion                           │
│   └─> createNotificationFromCommission()                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ DELIVERY MECHANISM                                               │
│                                                                  │
│ 1. Supabase Realtime Subscription                               │
│    ├─> postgres_changes (INSERT/UPDATE events)                   │
│    └─> broadcast events                                         │
│                                                                  │
│ 2. Service Observer Pattern                                     │
│    ├─> GlobalNotificationService.subscribe()                   │
│    ├─> ApprovalModalService.subscribe()                         │
│    └─> Other service subscriptions                              │
│                                                                  │
│ 3. Direct Function Calls                                        │
│    └─> Service.notify*() methods                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ UI DISPLAY                                                       │
│                                                                  │
│ Runner App:                                                      │
│   ├─> NotificationMobile/NotificationWebInstant                 │
│   │   └─> Commission notifications list                        │
│   ├─> SimpleTaskApprovalModal                                   │
│   │   └─> Task approval modal                                   │
│   └─> GlobalTaskCompletionModal                                 │
│       └─> Task completion modal                                  │
│                                                                  │
│ Caller App:                                                      │
│   ├─> NotificationMobile/NotificationWebInstant                │
│   │   └─> Warning notifications list                            │
│   ├─> GlobalErrandCompletionModal                              │
│   │   └─> Errand completion modal                               │
│   └─> GlobalErrandAcceptanceModal                               │
│       └─> Errand acceptance modal                               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Findings

**✅ Implemented:**
- Multiple notification delivery mechanisms (realtime, broadcast, in-memory services)
- Role-based filtering (runner/caller)
- Distance-based filtering for commission notifications
- Deduplication for errand notifications (processedErrandsRef, processedAcceptancesRef)
- Subscription cleanup on component unmount

**❌ Not Implemented:**
- Database INSERTs into `notifications` table (likely via database triggers not in codebase)
- Push notifications
- Polling mechanism
- Database read state tracking (`is_read` field not updated)
- Notification cleanup/archival
- Retry logic for failed notifications
- Admin-specific notification handlers

**⚠️ Risks:**
- Task approval notifications sent 3 times (triple delivery)
- No database persistence for most notifications (in-memory only)
- Silent failures (notifications may be dropped without user notification)
- No cleanup of old notifications
- Potential memory leaks if subscriptions not cleaned up properly

**📝 File References:**
- `services/GlobalNotificationService.ts` - Task completion/approval notifications
- `services/ApprovalModalService.ts` - Task approval notifications (redundant)
- `app/buddyrunner/notification.tsx` - Runner notification UI and commission subscription
- `app/buddycaller/notification.tsx` - Caller notification UI
- `app/buddycaller/task_progress.tsx` - Task approval trigger
- `app/buddyrunner/_layout.tsx` - Runner notification subscriptions setup
- `app/buddycaller/_layout.tsx` - Caller notification subscriptions setup
- `add_errand_notification_functions.sql` - Database functions for errand notification tracking
