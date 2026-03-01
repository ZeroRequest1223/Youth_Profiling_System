Place the LYDO logo image here so the dashboard can load it via Django static:

- Destination path (relative to workspace): `frontend/images/logo.png`
- Template reference used in `dashboard.html`: `{% static 'images/logo.png' %}`
- Recommended max display height: 120px (the template sets `max-height:120px`).
- Suggested image formats: JPG or PNG (JPG provided in attachment).

To use the attached logo, save it as `logo.jpg` in this folder.

If you prefer a PNG or different name, update the `src` in `frontend/dashboard.html` accordingly.
    