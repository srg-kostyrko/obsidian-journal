# Setup examples

## Daily Work Journal

```yaml
Type: Day
Folder: Work/DailyNotes
Name Template: {{date}} Daily Log
Date Format: YYYY-MM-DD
Auto-create: Enabled
Start date: Your employment start date
```

## Project Sprints

```yaml
Type: Custom
Every: Week
Duration: 2
Folder: Projects/{{journal_name}}/Sprints
Name Template: Sprint {{index}}
Sequential numbers: Enabled, Reset: Continuous
```

## Academic Term Notes

```yaml
Type: Week
Folder: Education/{{date:YYYY}}/{{date:MMMM}}
Name Template: Week {{index}} - {{start_date:MMM D}} to {{end_date:MMM D}}
Sequential numbers: Enabled, anchored on the term start date
Start writing on: Term start date
End writing: After date (term end date)
```

## Release and Sprint Numbering

```yaml
Type: Custom
Every: Week
Duration: 2
Folder: Projects/{{journal_name}}/Releases
Name Template: Release{{release}}Sprint{{sprint}}
Sequential numbers: Enabled, digit "release" starts at 4711 (Continuous), digit "sprint" starts at 1 (6 per release)
```

Produces `Release4711Sprint1` through `Release4711Sprint6`, then rolls over to
`Release4712Sprint1`.
