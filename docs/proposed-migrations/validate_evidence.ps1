$ErrorActionPreference = 'Stop'
$evidencePath = Join-Path $PSScriptRoot '../database-evidence/phase12b3a-inspection-original.csv'
$rows = @(Import-Csv -LiteralPath $evidencePath)
if ($rows.Count -ne 644) { throw 'Unexpected row count' }
$parsed = foreach ($row in $rows) {
    if ($row.total_rows -ne '644') { throw 'Inconsistent total_rows' }
    [pscustomobject]@{ Section = $row.section; Metadata = ($row.metadata | ConvertFrom-Json -ErrorAction Stop) }
}
$functions = @($parsed | Where-Object Section -eq '08_routines')
$triggers = @($parsed | Where-Object Section -eq '07_triggers')
if ($functions.Count -ne 6 -or $triggers.Count -ne 46) { throw 'Unexpected definition counts' }
$baseline = ($functions | Where-Object { $_.Metadata.name -eq 'register_for_event' }).Metadata.definition
$expected = $baseline.Replace('public.register_for_event(p_event_id uuid)', 'attendify_private.register_legacy(p_event_id uuid)').Replace('RETURNS registrations', 'RETURNS public.registrations')
$draft = Get-Content -Raw (Join-Path $PSScriptRoot '20261104_004_atomic_registration.sql')
if (-not $draft.Replace("`r`n", "`n").Contains($expected.Replace("`r`n", "`n"))) { throw 'Legacy helper differs from evidence' }
Write-Output 'PASS: 644 rows; 644 JSON cells; 6 functions; 46 triggers; baseline helper preserved.'
Write-Output 'This is local evidence validation, not SQL execution, syntax validation, or an authorization test.'
