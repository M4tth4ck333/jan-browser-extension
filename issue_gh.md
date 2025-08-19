# Jan Summarizer – Issue Tracker

This document tracks current strengths, problems to fix, and prioritized next steps for the Chrome side‑panel summarizer extension.

## ✅ Good Things
- [x] Tooltips / accessibility feature has good and intuitive design  

---

## ⚠️ Problematic Things (to fix / implement)

- [x] **Theme Consistency**  
  - Remove dark theme  
  - Stick with **only light theme** for now to ensure visual consistency  

- [x] **Default Providers**  
  - Set 3 default providers:  
    - Jan Server  
    - OpenAI  
    - Anthropic  
    - OpenRouter  
  - Everyone else should be treated as a **Custom Provider**  
  - Fix endpoints (no customization allowed)  
  - Only allow users to input their API key → ready to go  

- [ ] **Tooltips Simplification**  
  - Keep only:  
    - Rewrite  
    - Translate  
    - Custom prompt  
  - Remove all other tooltip options  

- [ ] **Extension Accessibility**  
  - Add a **shortcut (hotkey)** to open and close the extension  

- [ ] **Active Tab Behavior**  
  - Set **Follow Active Tab** as default  
  - Fix bug: If user unselects active tab → follow active tab also gets disabled  

- [ ] **Text Length Bug**  
  - Fix UI bug where long text causes the view to go **half black / half white**  

---

## 📌 Next Steps
- Prioritize UI fixes (theme & tooltip simplification)  
- Lock provider list & simplify API key input flow  
- Add keyboard shortcut for extension accessibility  
- Resolve active tab + text length rendering bugs  
