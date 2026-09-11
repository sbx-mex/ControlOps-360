Attribute VB_Name = "ThisWorkbook"
Option Explicit

Private Sub Workbook_Open()
    On Error Resume Next
    ControlOps360.OcultarMotor
    ThisWorkbook.Worksheets("PORTADA").Activate
    On Error GoTo 0
End Sub

Private Sub Workbook_BeforeClose(Cancel As Boolean)
    On Error Resume Next
    ControlOps360.OcultarMotor
    ThisWorkbook.Save
    On Error GoTo 0
End Sub

