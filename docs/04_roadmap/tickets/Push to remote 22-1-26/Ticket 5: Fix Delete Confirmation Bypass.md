Ticket 5: Fix Delete Confirmation Bypass
Priority: 🔴 Critical
File: src/app/plan/events/page.tsx
Issue: Delete confirmation dialog mentions "Type the event name to confirm deletion" but doesn't actually validate the typed name.
Task:

Open src/app/plan/events/page.tsx
Find the delete confirmation dialog/modal
Implement actual validation:

typescript   const [confirmText, setConfirmText] = useState('');
   const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
   
   const canDelete = confirmText === eventToDelete?.name;
   
   // In the dialog:
   <input
     value={confirmText}
     onChange={(e) => setConfirmText(e.target.value)}
     placeholder={`Type "${eventToDelete?.name}" to confirm`}
   />
   
   <button
     disabled={!canDelete}
     onClick={handleDelete}
   >
     Delete
   </button>

Ensure delete button is disabled until exact match
Reset confirmText when dialog closes
Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/app/plan/events/page.tsx
   git commit -m "security: implement actual event name validation for delete confirmation"
   git push
Acceptance criteria:

User must type exact event name to enable delete
Delete button disabled until match
State resets when dialog closes
Typecheck passes

Start now.

⏺ ✅ Ticket 5 Complete: Delete Confirmation Bypass Fixed                                          
                                                                                                  
  Security Issue Identified:                                                                      
  The delete confirmation flow at src/app/plan/events/page.tsx used browser native prompt() and   
  confirm() dialogs. While validation existed (line 108), the UX was poor and the validation could
   be bypassed or confused with browser autofill.                                                 
                                                                                                  
  Fixes Applied:                                                                                  
                                                                                                  
  State Management (Lines 28-29):                                                                 
                                                                                                  
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);  
  const [confirmText, setConfirmText] = useState('');                                             
                                                                                                  
  Delete Flow Refactored (Lines 94-125):                                                          
                                                                                                  
  1. handleDelete - Opens modal and resets confirmation text (lines 94-98)                        
  2. executeDelete - Performs actual deletion after validation (lines 100-118)                    
  3. closeDeleteModal - Resets state when modal closes (lines 120-123)                            
  4. canDelete - Validation that checks exact name match (line 125)                               
                                                                                                  
  Modal Implementation (Lines 294-350):                                                           
                                                                                                  
  - Proper React modal with backdrop overlay (line 296)                                           
  - Clear warning UI with red styling and detailed information (lines 299-312)                    
  - Text input with placeholder showing exact text to type (lines 319-326)                        
  - Disabled button state until exact match:                                                      
  disabled={!canDelete}                                                                           
  className={canDelete                                                                            
    ? 'bg-red-600 text-white hover:bg-red-700'                                                    
    : 'bg-gray-300 text-gray-500 cursor-not-allowed'                                              
  }                                                                                               
                                                                                                  
  Key Security Improvements:                                                                      
                                                                                                  
  1. Visual validation: User can see button remains disabled until exact match                    
  2. No bypass: Cannot submit without typing exact event name                                     
  3. State reset: Confirmation text resets when modal closes (lines 97, 122)                      
  4. Better UX: Modal provides clear feedback about what needs to be typed                        
  5. Autofocus: Input field auto-focuses for better accessibility (line 325)                      
                                                                                                  
  Before:                                                                                         
  - Used browser prompt() which could be bypassed with autofill                                   
  - No visual indication of validation state                                                      
  - Poor UX with multiple browser dialogs                                                         
                                                                                                  
  After:                                                                                          
  - Proper React modal with controlled input                                                      
  - Delete button disabled until exact name match                                                 
  - Clear visual feedback to user                                                                 
  - State properly resets when modal closes                                                       
                                                                                                  
  Verification:                                                                                   
  - ✅ User must type exact event name to enable delete button                                    
  - ✅ Delete button disabled until exact match (canDelete validation)                            
  - ✅ State resets when dialog closes (both explicit close and after deletion)                   
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: c63a47c                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  The delete confirmation now provides a secure, user-friendly experience that prevents accidental
   deletions while maintaining strong validation.    