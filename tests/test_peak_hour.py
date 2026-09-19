import unittest

from scripts.auditar_peak_hour import audit


class PeakHourExperienceTests(unittest.TestCase):
    def test_peak_hour_and_cycle_print_contract_is_green(self):
        result = audit()
        self.assertEqual(result["estado"], "VERDE")
        self.assertEqual(result["vistas"], ["Peak Hour", "Tarea de Ciclo"])
        self.assertEqual(result["pdf_carta"], ["peak-hour-plan", "cycle-day-plan"])
        self.assertEqual(result["tareas"], 52)
        self.assertTrue(result["promedio_prioritario"])
        self.assertTrue(result["captura_real"])
        self.assertTrue(result["actividad_editable"])


if __name__ == "__main__":
    unittest.main()
