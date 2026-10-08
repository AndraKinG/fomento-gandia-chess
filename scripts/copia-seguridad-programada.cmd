@echo off
rem ---------------------------------------------------------------------------
rem  Copia de seguridad diaria de los datos del club. La lanza el Programador de
rem  tareas de Windows, sin abrir ninguna ventana.
rem
rem  HACE LA COPIA Y LUEGO LA COMPRUEBA: una copia que nunca se revisa no se sabe
rem  si sirve hasta el dia que hace falta, que es el peor dia para descubrirlo.
rem
rem  MISMO PATRON QUE elo-fide-programado.cmd, y por lo mismo: el Programador no
rem  tiene ni el PATH ni la carpeta de trabajo de tu sesion. Aqui se entra en la
rem  carpeta del proyecto (%~dp0..), asi que si el proyecto se mueve de sitio
rem  esto sigue funcionando -- pero la TAREA hay que reapuntarla, que fue lo que
rem  dejo el ELO FIDE 18 dias sin actualizar en septiembre.
rem
rem  DEJA REGISTRO en logs/copia-seguridad.log (ignorado por git). Solo cuentas
rem  de filas: nada de datos de socios.
rem ---------------------------------------------------------------------------

cd /d "%~dp0.."
if not exist "logs" mkdir "logs"

echo. >> "logs\copia-seguridad.log"
echo ===== %DATE% %TIME% ===== >> "logs\copia-seguridad.log"

node scripts/copia-seguridad.mjs >> "logs\copia-seguridad.log" 2>&1
if errorlevel 1 (
  echo RESULTADO: la copia FALLO ^(codigo %errorlevel%^) >> "logs\copia-seguridad.log"
  exit /b 1
)

node scripts/copia-seguridad.mjs comprobar >> "logs\copia-seguridad.log" 2>&1
if errorlevel 1 (
  echo RESULTADO: copia hecha pero la comprobacion FALLO >> "logs\copia-seguridad.log"
  exit /b 1
)
echo RESULTADO: ok >> "logs\copia-seguridad.log"
