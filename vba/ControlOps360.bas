Attribute VB_Name = "ControlOps360"
Option Explicit

Private Const HOJA_PORTADA As String = "PORTADA"
Private Const HOJA_LOG As String = "_LOG"

Public Sub ActualizarMotor()
    Dim inicio As Date
    inicio = Now

    On Error GoTo ControlError
    PrepararAplicacion False
    RegistrarEvento "INICIO", "Actualización iniciada", inicio

    ' Power Query y conexiones existentes en el libro maestro.
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone
    EsperarCalculo 300

    ' Únicamente esta tabla acumula. La fuente de 21 días permanece intacta.
    AnexarSinDuplicados "tInventario21D", "tHistoricoInventario", _
        Array("CeCo", "Fecha", "IDTienda", "CodigoArticulo")

    ValidarTransaccionesNegativas "tAuditoriaTienda", "tAlertasNegativos"
    ThisWorkbook.RefreshAll
    Application.CalculateUntilAsyncQueriesDone

    OcultarMotor
    RegistrarEvento "OK", "Actualización terminada", inicio
    PrepararAplicacion True
    MsgBox "ControlOps 360 se actualizó correctamente.", vbInformation
    Exit Sub

ControlError:
    RegistrarEvento "ERROR", Err.Number & " - " & Err.Description, inicio
    PrepararAplicacion True
    MsgBox "La actualización se detuvo: " & Err.Description, vbCritical
End Sub

Public Sub OcultarMotor()
    Dim ws As Worksheet
    ThisWorkbook.Worksheets(HOJA_PORTADA).Visible = xlSheetVisible
    ThisWorkbook.Worksheets(HOJA_PORTADA).Activate
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> HOJA_PORTADA Then ws.Visible = xlSheetVeryHidden
    Next ws
End Sub

Public Sub MostrarMotorAdmin()
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        ws.Visible = xlSheetVisible
    Next ws
End Sub

Private Sub PrepararAplicacion(ByVal habilitar As Boolean)
    Application.ScreenUpdating = habilitar
    Application.EnableEvents = habilitar
    Application.DisplayAlerts = habilitar
    If habilitar Then
        Application.Calculation = xlCalculationAutomatic
    Else
        Application.Calculation = xlCalculationManual
    End If
End Sub

Private Sub EsperarCalculo(ByVal timeoutSegundos As Long)
    Dim limite As Date
    limite = DateAdd("s", timeoutSegundos, Now)
    Do While Application.CalculationState <> xlDone
        DoEvents
        If Now > limite Then Err.Raise vbObjectError + 360, , "Tiempo de espera agotado al actualizar conexiones."
    Loop
End Sub

Private Sub AnexarSinDuplicados(ByVal tablaOrigen As String, ByVal tablaDestino As String, ByVal claves As Variant)
    Dim origen As ListObject, destino As ListObject
    Dim existentes As Object, fila As ListRow, llave As String
    Dim nueva As ListRow, i As Long

    Set origen = BuscarTabla(tablaOrigen)
    Set destino = BuscarTabla(tablaDestino)
    Set existentes = CreateObject("Scripting.Dictionary")
    existentes.CompareMode = vbTextCompare

    If Not destino.DataBodyRange Is Nothing Then
        For Each fila In destino.ListRows
            llave = LlaveFila(destino, fila, claves)
            If Len(llave) > 0 Then existentes(llave) = True
        Next fila
    End If

    If origen.DataBodyRange Is Nothing Then Exit Sub
    For Each fila In origen.ListRows
        llave = LlaveFila(origen, fila, claves)
        If Len(llave) = 0 Then Err.Raise vbObjectError + 361, , "Fila sin llave en " & tablaOrigen
        If Not existentes.Exists(llave) Then
            Set nueva = destino.ListRows.Add
            For i = 1 To destino.ListColumns.Count
                nueva.Range.Cells(1, i).Value = ValorPorEncabezado(origen, fila, destino.ListColumns(i).Name)
            Next i
            existentes(llave) = True
        End If
    Next fila
End Sub

Private Sub ValidarTransaccionesNegativas(ByVal tablaOrigen As String, ByVal tablaDestino As String)
    Dim origen As ListObject, destino As ListObject, fila As ListRow, nueva As ListRow
    Dim cantidad As Double, importe As Double, i As Long
    Set origen = BuscarTabla(tablaOrigen)
    Set destino = BuscarTabla(tablaDestino)
    If Not destino.DataBodyRange Is Nothing Then destino.DataBodyRange.Delete
    If origen.DataBodyRange Is Nothing Then Exit Sub

    For Each fila In origen.ListRows
        cantidad = NumeroSeguro(ValorPorEncabezado(origen, fila, "Cantidad"))
        importe = NumeroSeguro(ValorPorEncabezado(origen, fila, "Importe"))
        If cantidad < 0 Or importe < 0 Then
            Set nueva = destino.ListRows.Add
            For i = 1 To destino.ListColumns.Count
                If destino.ListColumns(i).Name = "Motivo" Then
                    nueva.Range.Cells(1, i).Value = "Transacción negativa"
                Else
                    nueva.Range.Cells(1, i).Value = ValorPorEncabezado(origen, fila, destino.ListColumns(i).Name)
                End If
            Next i
        End If
    Next fila
End Sub

Private Function BuscarTabla(ByVal nombreTabla As String) As ListObject
    Dim ws As Worksheet, lo As ListObject
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If StrComp(lo.Name, nombreTabla, vbTextCompare) = 0 Then
                Set BuscarTabla = lo
                Exit Function
            End If
        Next lo
    Next ws
    Err.Raise vbObjectError + 362, , "No se encontró la tabla: " & nombreTabla
End Function

Private Function LlaveFila(ByVal tabla As ListObject, ByVal fila As ListRow, ByVal claves As Variant) As String
    Dim i As Long, parte As String, acumulado As String
    For i = LBound(claves) To UBound(claves)
        parte = Trim$(CStr(ValorPorEncabezado(tabla, fila, CStr(claves(i)))))
        If Len(parte) = 0 Then Exit Function
        acumulado = acumulado & IIf(Len(acumulado) > 0, "|", "") & UCase$(parte)
    Next i
    LlaveFila = acumulado
End Function

Private Function ValorPorEncabezado(ByVal tabla As ListObject, ByVal fila As ListRow, ByVal encabezado As String) As Variant
    Dim columna As ListColumn
    On Error Resume Next
    Set columna = tabla.ListColumns(encabezado)
    On Error GoTo 0
    If columna Is Nothing Then
        ValorPorEncabezado = Empty
    Else
        ValorPorEncabezado = fila.Range.Cells(1, columna.Index).Value
    End If
End Function

Private Function NumeroSeguro(ByVal valor As Variant) As Double
    If IsNumeric(valor) Then NumeroSeguro = CDbl(valor) Else NumeroSeguro = 0
End Function

Private Sub RegistrarEvento(ByVal estado As String, ByVal detalle As String, ByVal inicio As Date)
    Dim ws As Worksheet, siguiente As Long
    Set ws = ThisWorkbook.Worksheets(HOJA_LOG)
    siguiente = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    ws.Cells(siguiente, 1).Value = Now
    ws.Cells(siguiente, 2).Value = estado
    ws.Cells(siguiente, 3).Value = detalle
    ws.Cells(siguiente, 4).Value = DateDiff("s", inicio, Now)
End Sub

