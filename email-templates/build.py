"""
Genera el HTML de las 12 plantillas de Brevo (una por MailTemplate).

    python3 build.py                       # logo subido a la biblioteca de Brevo
    python3 build.py https://.../logo.png  # otra URL de logo

Salida: html/<plantilla>.html. Cada archivo se pega en Stripo (My HTML) o
directo en Brevo (Nueva plantilla › Pegar tu código). Las variables usan la
sintaxis de Brevo: {{ params.x }}, {% if %}, {% for %}. Los nombres de los
params salen de EmailNotificationsService, RemindersService y AuthService.
"""
import sys
from pathlib import Path

LOGO_URL = sys.argv[1] if len(sys.argv) > 1 else 'https://img.mailinblue.com/12210274/images/content_library/original/6ab109f94997083910c4cd28.png'

# Tokens de pf-front/app/globals.css (tema claro).
BG = '#F6F6F7'
SURFACE = '#FFFFFF'
BORDER = '#E4E4EA'
TEXT = '#0F0F14'
TEXT_2 = '#4A4A57'
MUTED = '#6C6C82'
PRIMARY = '#4F46E5'  # --color-primary-solid: soporta texto blanco encima
PRIMARY_SUBTLE = '#EEF2FF'
ACCENT = '#C2410C'
ACCENT_SUBTLE = '#FFF7ED'
SUCCESS = '#047857'
SUCCESS_SUBTLE = '#ECFDF5'
FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


# ── Bloques ──────────────────────────────────────────────────────────

def h1(text):
    return (f'<h1 style="margin:0 0 16px;font-family:{FONT};font-size:24px;'
            f'line-height:1.3;font-weight:700;color:{TEXT};">{text}</h1>')


def p(text, color=TEXT_2, size=16):
    return (f'<p style="margin:0 0 16px;font-family:{FONT};font-size:{size}px;'
            f'line-height:1.6;color:{color};">{text}</p>')


def button(label, url, color=PRIMARY):
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="{color}" style="border-radius:8px;">
      <a href="{url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:{FONT};font-size:16px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:8px;">{label}</a>
    </td>
  </tr>
</table>'''


def box(inner, bg=PRIMARY_SUBTLE, border=None):
    border_css = f'border:1px solid {border};' if border else ''
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td style="background:{bg};{border_css}border-radius:12px;padding:20px 24px;font-family:{FONT};font-size:15px;line-height:1.6;color:{TEXT};">
{inner}
    </td>
  </tr>
</table>'''


def rows(pairs):
    """Tabla etiqueta/valor (comprobantes)."""
    trs = ''.join(
        f'<tr><td style="padding:6px 0;font-family:{FONT};font-size:14px;color:{MUTED};">{k}</td>'
        f'<td align="right" style="padding:6px 0;font-family:{FONT};font-size:14px;font-weight:600;color:{TEXT};">{v}</td></tr>'
        for k, v in pairs)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{trs}</table>'


def link(label, url):
    return f'<a href="{url}" target="_blank" style="color:{PRIMARY};text-decoration:underline;">{label}</a>'


def small(text):
    return p(text, color=MUTED, size=13)


SET_PASSWORD = f'''{{% if params.setPasswordUrl %}}
{box(
    f'<strong>Primero, elegí tu contraseña.</strong><br>'
    f'Tu cuenta la creó un administrador. Para entrar, definí tu contraseña desde este '
    f'{link("enlace", "{{ params.setPasswordUrl }}")}.'
)}
{{% endif %}}'''


# ── Layout ───────────────────────────────────────────────────────────

def layout(preheader, body, footer_extra=''):
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>Campus</title>
<style>
  @media only screen and (max-width:620px) {{
    .container {{ width:100% !important; }}
    .card {{ padding:28px 20px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG}" style="background:{BG};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <!-- Logo -->
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;"><img src="{LOGO_URL}" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px;"></td>
                <td style="font-family:{FONT};font-size:22px;font-weight:700;color:{TEXT};">Campus</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Contenido -->
        <tr>
          <td class="card" bgcolor="{SURFACE}" style="background:{SURFACE};border:1px solid {BORDER};border-radius:16px;padding:40px;">
{body}
            <p style="margin:8px 0 0;font-family:{FONT};font-size:16px;line-height:1.6;color:{TEXT_2};">¡Nos vemos en el Campus!<br><strong style="color:{TEXT};">El equipo de Campus</strong></p>
          </td>
        </tr>
        <!-- Pie -->
        <tr>
          <td align="center" style="padding:24px 16px 0;font-family:{FONT};font-size:12px;line-height:1.6;color:{MUTED};">
            Campus — Aprendé con un tutor de IA a tu lado.<br>
            Recibiste este mail porque tenés una cuenta en Campus.{footer_extra}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
'''


UNSUBSCRIBE = (f'<br>{link("Dejar de recibir estos recordatorios", "{{ params.unsubscribeUrl }}")}'
               .replace(f'color:{PRIMARY}', f'color:{MUTED}'))


# ── Plantillas ───────────────────────────────────────────────────────
# (archivo, asunto sugerido, preheader, cuerpo, pie extra)

TEMPLATES = [
    ('reset-password',
     'Restablecé tu contraseña',
     'Usá este enlace para elegir una contraseña nueva.',
     h1('Restablecé tu contraseña')
     + p('Hola {{ params.name }}, recibimos un pedido para cambiar la contraseña de tu cuenta.')
     + button('Elegir nueva contraseña', '{{ params.resetUrl }}')
     + small('El enlace vence en {{ params.expiresInMinutes }} minutos. Si no pediste el cambio, '
             'ignorá este mail: tu contraseña sigue siendo la misma.'),
     ''),

    ('welcome-student',
     '¡Bienvenido/a a Campus, {{ params.name }}!',
     'Tu cuenta ya está lista. Empezá a aprender hoy.',
     h1('¡Bienvenido/a, {{ params.name }}!')
     + p('Tu cuenta de estudiante ya está lista. En Campus aprendés a tu ritmo, '
         'con un tutor de IA que te acompaña en cada lección.')
     + SET_PASSWORD
     + button('Explorar cursos', '{{ params.coursesUrl }}')
     + small(f'También podés ir directo a tu {link("panel", "{{ params.dashboardUrl }}")}.'),
     ''),

    ('welcome-teacher',
     '¡Bienvenido/a a Campus, {{ params.name }}!',
     'Tu cuenta de docente ya está lista. Creá tu primer curso.',
     h1('¡Bienvenido/a, {{ params.name }}!')
     + p('Tu cuenta de docente ya está lista. Armá tu curso con módulos y lecciones, '
         'y tus alumnos van a tener un tutor de IA que los acompaña.')
     + SET_PASSWORD
     + button('Crear mi primer curso', '{{ params.createCourseUrl }}')
     + small(f'También podés ir directo a tu {link("panel", "{{ params.dashboardUrl }}")}.'),
     ''),

    ('welcome-admin',
     'Tu cuenta de administrador en Campus',
     'Ya tenés acceso al panel de administración.',
     h1('Hola, {{ params.name }}')
     + p('Tu cuenta de administrador de Campus ya está activa. Desde el panel podés '
         'gestionar usuarios, cursos y pagos.')
     + SET_PASSWORD
     + button('Ir al panel de administración', '{{ params.adminUrl }}'),
     ''),

    ('course-enrolled',
     'Te inscribiste a "{{ params.courseTitle }}"',
     'Ya podés empezar la primera lección.',
     '{% if params.courseImageUrl %}'
     '<img src="{{ params.courseImageUrl }}" width="518" alt="{{ params.courseTitle }}" '
     'style="display:block;width:100%;max-width:518px;height:auto;border:0;border-radius:12px;margin:0 0 24px;">'
     '{% endif %}'
     + h1('¡Ya estás en "{{ params.courseTitle }}"!')
     + p('Hola {{ params.name }}, tu inscripción está confirmada. El curso tiene '
         '<strong>{{ params.totalLessons }} lecciones</strong> y dura unos '
         '<strong>{{ params.totalMinutes }} minutos</strong>.')
     + button('Empezar la primera lección', '{{ params.firstLessonUrl }}')
     + box(
         f'<div style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:{PRIMARY};margin-bottom:8px;">Temario</div>\n'
         '{% for module in params.modules %}'
         f'<div style="font-weight:600;color:{TEXT};margin-top:12px;">{{{{ module.title }}}}</div>'
         '{% for lesson in module.lessons %}'
         f'<div style="font-size:14px;color:{TEXT_2};padding-left:12px;">• {{{{ lesson.title }}}}'
         f'{{% if lesson.duration %}} <span style="color:{MUTED};">· {{{{ lesson.duration }}}} min</span>{{% endif %}}</div>'
         '{% endfor %}'
         '{% endfor %}',
         bg=BG, border=BORDER)
     + small(f'Podés ver el curso completo en {link("su página", "{{ params.courseUrl }}")}.'),
     ''),

    ('course-purchased',
     'Compra confirmada: {{ params.courseTitle }}',
     'Tu pago se acreditó. Ya tenés acceso al curso.',
     h1('¡Compra confirmada!')
     + p('Hola {{ params.name }}, tu pago se acreditó y ya tenés acceso a '
         '<strong>{{ params.courseTitle }}</strong>.')
     + box(rows([
         ('Curso', '{{ params.courseTitle }}'),
         ('Total', '{{ params.amount }}'),
         ('Fecha', '{{ params.paidAt }}'),
         ('N.º de operación', '<span style="font-family:monospace;font-size:12px;">{{ params.paymentId }}</span>'),
     ]), bg=BG, border=BORDER)
     + button('Ir al curso', '{{ params.firstLessonUrl }}')
     + small(f'Podés ver tus pagos en {link("Configuración", "{{ params.paymentsUrl }}")}.'),
     ''),

    ('course-completed',
     '¡Completaste "{{ params.courseTitle }}"!',
     'Felicitaciones por terminar el curso.',
     h1('¡Felicitaciones, {{ params.name }}! 🎉')
     + p('Terminaste <strong>{{ params.courseTitle }}</strong>. Es un gran logro: '
         'le dedicaste tiempo y esfuerzo, y se nota.')
     + box('Tu certificado te llega en un mail aparte, en unos minutos.',
           bg=SUCCESS_SUBTLE)
     + button('Buscar mi próximo curso', '{{ params.coursesUrl }}')
     + small(f'Repasá lo que ya hiciste en {link("Mis cursos", "{{ params.myCoursesUrl }}")}.'),
     ''),

    ('certificate',
     'Tu certificado de "{{ params.courseTitle }}"',
     'Tu certificado ya está disponible para descargar y compartir.',
     h1('Tu certificado está listo')
     + p('Hola {{ params.name }}, ya podés ver y descargar tu certificado de '
         '<strong>{{ params.courseTitle }}</strong>.')
     + box(f'<div style="font-size:13px;color:{MUTED};">Código de verificación</div>'
           f'<div style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:.05em;color:{TEXT};">{{{{ params.code }}}}</div>',
           bg=BG, border=BORDER)
     + button('Ver mi certificado', '{{ params.certificateUrl }}')
     + small('Cualquier persona puede comprobar que es auténtico desde '
             f'{link("este enlace de verificación", "{{ params.verifyUrl }}")}.'),
     ''),

    ('premium-confirmed',
     '¡Ya sos {{ params.planName }}!',
     'Tu suscripción está activa: todos los cursos, sin límites.',
     h1('¡Ya sos {{ params.planName }}! ⭐')
     + p('Hola {{ params.name }}, tu suscripción está activa. Ya podés acceder a todos '
         'los cursos del Campus.')
     + box(rows([
         ('Plan', '{{ params.planName }}'),
         ('Total', '{{ params.amount }}'),
         ('Válido hasta', '{% if params.validUntil %}{{ params.validUntil }}{% else %}—{% endif %}'),
     ]), bg=ACCENT_SUBTLE)
     + button('Explorar cursos', '{{ params.coursesUrl }}')
     + small(f'Podés ver tus pagos en {link("Configuración", "{{ params.paymentsUrl }}")}.'),
     ''),

    ('student-reminder',
     'Te extrañamos en Campus',
     'Tus cursos te están esperando.',
     h1('Te extrañamos, {{ params.name }}')
     + p('Hace <strong>{{ params.maxDaysInactive }} días</strong> que no entrás a alguno '
         'de tus cursos. Unos minutos hoy alcanzan para retomar el ritmo.')
     + box(
         '{% for course in params.courses %}'
         f'<div style="padding:6px 0;"><a href="{{{{ course.url }}}}" target="_blank" '
         f'style="font-weight:600;color:{PRIMARY};text-decoration:none;">{{{{ course.title }}}}</a>'
         f'<br><span style="font-size:13px;color:{MUTED};">{{{{ course.daysInactive }}}} días sin actividad</span></div>'
         '{% endfor %}',
         bg=BG, border=BORDER)
     + button('Retomar mis cursos', '{{ params.myCoursesUrl }}'),
     UNSUBSCRIBE),

    ('teacher-new-student',
     'Nuevo alumno en "{{ params.courseTitle }}"',
     '{{ params.studentName }} se inscribió a tu curso.',
     h1('¡Tenés un alumno nuevo!')
     + p('Hola {{ params.teacherName }}, <strong>{{ params.studentName }}</strong> se '
         'inscribió a <strong>{{ params.courseTitle }}</strong>.')
     + box(f'<div style="font-size:13px;color:{MUTED};">Alumnos inscriptos</div>'
           f'<div style="font-size:28px;font-weight:700;color:{PRIMARY};">{{{{ params.totalStudents }}}}</div>')
     + button('Ver mi curso', '{{ params.courseAdminUrl }}'),
     ''),

    ('teacher-reminder',
     '¿Qué vas a enseñar ahora?',
     'Tus alumnos esperan tu próximo curso.',
     h1('¿Qué vas a enseñar ahora, {{ params.name }}?')
     + '{% if params.hasCourses %}'
     + p('Pasaron <strong>{{ params.daysSinceLastCourse }} días</strong> desde tu último curso. '
         'Tus alumnos ya están listos para lo que venga.')
     + '{% else %}'
     + p('Hace <strong>{{ params.daysSinceLastCourse }} días</strong> que te sumaste a Campus y todavía '
         'no publicaste tu primer curso. ¡Es más fácil de lo que parece!')
     + '{% endif %}'
     + button('Crear un curso', '{{ params.createCourseUrl }}'),
     UNSUBSCRIBE),
]


def main():
    out = Path(__file__).parent / 'html'
    out.mkdir(exist_ok=True)
    subjects = []
    for name, subject, preheader, body, footer in TEMPLATES:
        (out / f'{name}.html').write_text(layout(preheader, body, footer), encoding='utf-8')
        subjects.append(f'{name}: {subject}')
    (out / 'ASUNTOS.txt').write_text('\n'.join(subjects) + '\n', encoding='utf-8')
    print(f'{len(TEMPLATES)} plantillas en {out} (logo: {LOGO_URL})')


if __name__ == '__main__':
    main()
