# board-search-filter evidence

Board verified pre-seeded per the spec table before any interaction (see screenshot 01) and was not re-seeded.

## 1. Unfiltered board shows filter bar, empty search, no indicator/clear button
Given the board is loaded fresh, When no filter is applied, Then all six cards are visible across their lanes, `board-filter-bar` and an empty `board-search-input` are present, and no `board-filter-indicator` or `board-clear-filters` are rendered.
**PASS** - All six cards visible (Follow up with Sam; Write proposal, Review budget; Book venue; Prep board deck, Send recap). DOM check confirmed `board-filter-bar` and `board-search-input` (value "") present, `board-filter-indicator` and `board-clear-filters` absent.
Screenshot: 01-unfiltered-board.png

## 2. Typing "SAM" narrows live, no button press
Given the board is loaded, When "SAM" is typed into the search input, Then it narrows live: To Do shows only "Follow up with Sam", the other three lanes show their empty placeholder, and the indicator reads "1 of 6 cards" with the clear button visible.
**PASS** - To Do showed only "Follow up with Sam"; In Progress, Waiting, Done all showed the `lane-empty` "No tasks" placeholder; indicator read "1 of 6 cards"; "Clear filters" button visible. Filtering occurred immediately on input, no submit or button press needed.
Screenshot: 02-typing-sam.png

## 3. Typing "budget" matches note text and title
Given the search is cleared, When "budget" is typed, Then In Progress shows "Write proposal" (matched via note text "Waiting on budget numbers") and "Review budget" (matched via title), other lanes show their empty placeholder.
**PASS** - In Progress showed both "Write proposal" and "Review budget"; To Do, Waiting, Done showed empty placeholders; indicator read "2 of 6 cards".
Screenshot: 03-typing-budget.png

## 4. Typing "rivera" and "acme" match linked person/company names
Given the search is cleared, When "rivera" is typed, Then only "Follow up with Sam" is visible (matched via linked person name Sam Rivera). When cleared and "acme" is typed, Then only "Book venue" is visible (matched via linked company name Acme Inc).
**PASS** - "rivera" showed only "Follow up with Sam" in To Do, other lanes empty, indicator "1 of 6 cards". "acme" showed only "Book venue" in Waiting, other lanes empty, indicator "1 of 6 cards".
Screenshots: 04a-typing-rivera.png, 04b-typing-acme.png

## 5. Typing "zebra" matches nothing
Given the search is cleared, When "zebra" is typed, Then all four lanes show their empty placeholder, "No cards match" is shown, and the indicator reads "0 of 6 cards".
**PASS** - All four lanes showed the `lane-empty` placeholder, a "No cards match" paragraph (`board-no-matches`) appeared, and the indicator read "0 of 6 cards".
Screenshot: 05-typing-zebra.png

## 6. Tag selector offers exactly Q3 and VIP, alphabetically, Prospect absent
Given the search is cleared, When the `board-tag-filter` selector is opened, Then it offers exactly "Q3" and "VIP" alphabetically, with "Prospect" absent.
**PASS** - Dropdown opened showing exactly two options in order: "Q3", "VIP". "Prospect" was not present. The board behind the dropdown correctly showed all six cards (search had been cleared beforehand).
Screenshot: 06-tag-dropdown-open.png

## 7. Selecting Q3 then also VIP narrows via OR logic across tags
Given the tag selector is open, When "Q3" is selected, Then exactly "Write proposal", "Prep board deck", "Send recap" are visible (3 of 6 cards). When "VIP" is additionally selected, Then "Follow up with Sam" also appears (4 cards total) and the indicator reads "4 of 6 cards".
**PASS** - After selecting Q3: In Progress showed only "Write proposal", Done showed "Prep board deck" and "Send recap", To Do and Waiting empty, indicator "3 of 6 cards". After additionally selecting VIP: To Do showed "Follow up with Sam", indicator read "4 of 6 cards", and the dropdown remained open across both selections, confirming multi-select behavior.
Screenshot: 07-q3-and-vip-selected.png

## 8. Filter persists across page reload
Given the Q3+VIP filter is active, When the page is reloaded, Then the filter and narrowed board are still exactly as before.
**PASS** - After a full page reload, both "Q3" and "VIP" tag chips remained selected, the indicator still read "4 of 6 cards", and the same four cards (Follow up with Sam, Write proposal, Prep board deck, Send recap) were shown in their respective lanes.
Screenshot: 08-persisted-after-reload.png

## 9. Filter persists across navigation away and back
Given the Q3+VIP filter is active, When navigating to the People page and back to the board, Then the filter and narrowed board are still intact.
**PASS** - After navigating to /people and back to /, the Q3+VIP filter chips, the "4 of 6 cards" indicator, and the narrowed board were all still present and correct.
Screenshot: 09-persisted-after-navigation.png

## 10. Clear filters restores full board
Given the Q3+VIP filter is active, When "Clear filters" is clicked, Then all six cards return in their original manual order, search input is empty, no tag selected, no indicator.
**PASS** - After clicking `board-clear-filters`, all six cards reappeared in original order (Follow up with Sam; Write proposal, Review budget; Book venue; Prep board deck, Send recap), search input was empty, the tag selector was back to "Please Select", and neither the indicator nor the clear button were rendered.
Screenshot: 10-clear-filters.png

## 11. Drag under an active filter preserves hidden cards' order in the true (unfiltered) list
Given tag "Q3" is selected again (In Progress shows only "Write proposal", Done shows "Prep board deck" then "Send recap"), When "Write proposal" is dragged from In Progress into the Waiting lane, and then "Clear filters" is clicked, Then Waiting shows "Book venue" then "Write proposal" - i.e. the filtered drag appended to the bottom of Waiting's true/unfiltered list, not disturbing hidden cards.
**PASS** - With the Q3 filter active, "Write proposal" was dragged from the In Progress list into the Waiting list; it landed in Waiting (still visible there since it carries the Q3 tag), and In Progress showed the empty placeholder afterward. After clicking "Clear filters", the Waiting lane showed exactly "Book venue" then "Write proposal" in that order, confirming the drag appended below the previously-hidden "Book venue" card rather than disturbing or reordering it.
Screenshot: 11-waiting-lane-after-filtered-drag.png

## Summary

All 11 scenarios PASSED. No deviations from the spec were observed. The board was verified pre-seeded exactly per the given table before any interaction and was not re-seeded; the only data mutation performed was the single required cross-lane drag in scenario 11, which is part of the scenario itself (not incidental setup) and is expected to remain as the new state of the board going forward.
