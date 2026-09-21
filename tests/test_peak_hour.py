import unittest

from scripts.auditar_peak_hour import audit


class PeakHourExperienceTests(unittest.TestCase):
    def test_peak_hour_and_cycle_print_contract_is_green(self):
        result = audit()
        self.assertEqual(result["estado"], "VERDE")
        self.assertEqual(result["vistas"], ["Peak Hour", "PH Tendencia", "Tarea de Ciclo"])
        self.assertEqual(result["pdf_carta"], {"peak_hour_paginas": 2, "ph_tendencia_paginas": 1, "tarea_ciclo_paginas": 1})
        self.assertTrue(result["time_period_una_pagina"])
        self.assertTrue(result["mismo_dia_entre_semanas"])
        self.assertTrue(result["diferencia_semana_anterior"])
        self.assertTrue(result["peak_cuatro_medias_horas"])
        self.assertEqual(result["tareas"], 52)
        self.assertTrue(result["promedio_prioritario"])
        self.assertTrue(result["captura_real"])
        self.assertTrue(result["actividad_editable"])


if __name__ == "__main__":
    unittest.main()
