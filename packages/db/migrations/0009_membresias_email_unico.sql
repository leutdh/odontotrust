-- One membership per email inside a clinic (case-insensitive). Rows without email are unconstrained.
CREATE UNIQUE INDEX membresias_clinica_email_uk ON membresias (clinica_id, lower(email)) WHERE email IS NOT NULL;
