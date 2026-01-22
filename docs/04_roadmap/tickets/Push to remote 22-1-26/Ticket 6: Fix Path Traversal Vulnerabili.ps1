Ticket 6: Fix Path Traversal Vulnerability
Priority: 🔴 Critical
File: scripts/triage-unknown-routes.ts
Issue: Lines 90-95 and 163-167 - Path traversal vulnerability where file paths are used without sanitization.
Task:

Open scripts/triage-unknown-routes.ts
Find lines 90-95 and 163-167 where file paths are processed
Add path sanitization:

typescript   import path from 'path';
   
   function sanitizePath(filePath: string, baseDir: string): string | null {
     const resolved = path.resolve(baseDir, filePath);
     const normalizedBase = path.resolve(baseDir);
     
     // Ensure resolved path is within base directory
     if (!resolved.startsWith(normalizedBase + path.sep)) {
       console.error(`Path traversal attempt blocked: ${filePath}`);
       return null;
     }
     
     return resolved;
   }

Apply sanitization before any file system access
Handle null returns appropriately (skip or error)
Verify fix:

bash   npm run typecheck

Commit:

bash   git add scripts/triage-unknown-routes.ts
   git commit -m "security: add path sanitization to prevent traversal attacks"
   git push
Acceptance criteria:

All file paths sanitized before use
Path traversal attempts blocked and logged
Typecheck passes

Start now.


⏺ ✅ Ticket 6 Complete: Path Traversal Vulnerability Fixed                                        
                                                                                                  
  Security Issue Identified:                                                                      
  The scripts/triage-unknown-routes.ts file had critical path traversal vulnerabilities where file
   paths were used for file system operations without sanitization:                               
  1. Line 34 (now 61): fs.readFileSync(inventoryPath) - Accepted arbitrary file path parameter    
  2. Line 166 (now 201): fs.existsSync(inventoryPath) - Used constructed path without validation  
                                                                                                  
  Fixes Applied:                                                                                  
                                                                                                  
  1. Path Sanitization Function (Lines 14-31):                                                    
                                                                                                  
  function sanitizePath(filePath: string, baseDir: string): string | null {                       
    const resolved = path.resolve(baseDir, filePath);                                             
    const normalizedBase = path.resolve(baseDir);                                                 
                                                                                                  
    // SECURITY: Ensure resolved path is within base directory                                    
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {         
      console.error(`⚠️  SECURITY: Path traversal attempt blocked: ${filePath}`);                 
      return null;                                                                                
    }                                                                                             
                                                                                                  
    return resolved;                                                                              
  }                                                                                               
                                                                                                  
  Security mechanism:                                                                             
  - Resolves both the input path and base directory to absolute paths                             
  - Checks that resolved path starts with the normalized base directory                           
  - Returns null if path traversal detected (e.g., ../../etc/passwd)                              
  - Logs security violations for monitoring                                                       
                                                                                                  
  2. parseInventory Function Hardening (Lines 52-61):                                             
                                                                                                  
  function parseInventory(inventoryPath: string): RouteRow[] {                                    
    // SECURITY: Sanitize inventory path before file system access                                
    const projectRoot = path.resolve(__dirname, '..');                                            
    const safePath = sanitizePath(inventoryPath, projectRoot);                                    
                                                                                                  
    if (!safePath) {                                                                              
      throw new Error('Invalid inventory path - path traversal detected');                        
    }                                                                                             
                                                                                                  
    const content = fs.readFileSync(safePath, 'utf-8');                                           
                                                                                                  
  Protection:                                                                                     
  - Validates path is within project root before reading                                          
  - Throws error if path traversal detected                                                       
  - Prevents reading arbitrary files like /etc/passwd                                             
                                                                                                  
  3. main Function Hardening (Lines 190-204):                                                     
                                                                                                  
  function main() {                                                                               
    // SECURITY: Construct and sanitize inventory path                                            
    const projectRoot = path.resolve(__dirname, '..');                                            
    const requestedPath = path.join(projectRoot, 'SECURITY_ROUTE_INVENTORY.md');                  
    const inventoryPath = sanitizePath(requestedPath, projectRoot);                               
                                                                                                  
    if (!inventoryPath) {                                                                         
      console.error('ERROR: Invalid inventory path - security check failed');                     
      process.exit(1);                                                                            
    }                                                                                             
                                                                                                  
    if (!fs.existsSync(inventoryPath)) {                                                          
      console.error('ERROR: SECURITY_ROUTE_INVENTORY.md not found');                              
      process.exit(1);                                                                            
    }                                                                                             
                                                                                                  
  Security improvements:                                                                          
  - Sanitizes constructed path before any file system access                                      
  - Fails safely if sanitization detects attack                                                   
  - Clear error messaging for security failures                                                   
                                                                                                  
  Attack Scenarios Blocked:                                                                       
                                                                                                  
  Before (Vulnerable):                                                                            
  // Attacker could pass: '../../../etc/passwd'                                                   
  parseInventory('../../../etc/passwd'); // Would read /etc/passwd                                
                                                                                                  
  After (Protected):                                                                              
  // Same attack attempt:                                                                         
  parseInventory('../../../etc/passwd');                                                          
  // sanitizePath returns null                                                                    
  // Throws: "Invalid inventory path - path traversal detected"                                   
  // Logs: "⚠️  SECURITY: Path traversal attempt blocked: ../../../etc/passwd"                    
                                                                                                  
  Verification:                                                                                   
  - ✅ All file paths sanitized before file system access                                         
  - ✅ Path traversal attempts blocked and logged with security warnings                          
  - ✅ Fails safely with clear error messages                                                     
  - ✅ Project root boundary enforced                                                             
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: fb5bc8a                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  The script now safely validates all file paths, preventing attackers from reading arbitrary     
  files on the system through path traversal attacks.     