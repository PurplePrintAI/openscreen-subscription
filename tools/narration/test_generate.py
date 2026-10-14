import tempfile
import unittest
from pathlib import Path
from generate import validate_job, validate_tone_model


class NarrationJobTests(unittest.TestCase):
    def test_tone_requires_supported_model_and_bounded_text(self):
        job = {"mode": "preset", "text": "대본", "instruct": "밝고 또렷하게"}
        self.assertEqual(validate_job(job, self.output), job)
        validate_tone_model(job, {"tts_model_type":"custom_voice", "tts_model_size":"1b7"})
        with self.assertRaisesRegex(ValueError, "would ignore"):
            validate_tone_model(job, {"tts_model_type":"custom_voice", "tts_model_size":"0b6"})
        validate_tone_model({**job,"instruct":""}, {"tts_model_type":"custom_voice", "tts_model_size":"0b6"})
        for value in (42, "x" * 1201):
            with self.assertRaisesRegex(ValueError, "Tone instruction"):
                validate_job({**job,"instruct":value},self.output)
        with self.assertRaisesRegex(ValueError, "voice cloning"):
            validate_job({**job,"mode":"clone"},self.output)

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.output = self.root / "new.wav"

    def test_preset_does_not_require_or_accept_private_reference(self):
        job = {"mode": "preset", "text": "퍼플프린트입니다."}
        self.assertEqual(validate_job(job, self.output), job)
        with self.assertRaisesRegex(ValueError, "personal recording"):
            validate_job({**job, "referenceAudio": str(self.root / "private.wav")}, self.output)

    def test_clone_requires_permission_before_reading_reference(self):
        with self.assertRaisesRegex(ValueError, "permission"):
            validate_job({"mode": "clone", "text": "안녕하세요", "referenceAudio": "missing.wav"}, self.output)

    def test_clone_requires_local_file_and_transcript(self):
        job = {"mode": "clone", "text": "안녕하세요", "speakerConsent": True,
               "referenceAudio": "https://example.invalid/private.wav", "referenceText": "안녕하세요"}
        with self.assertRaisesRegex(ValueError, "absolute local"):
            validate_job(job, self.output)
        ref = self.root / "reference.wav"
        ref.write_bytes(b"fixture; preflight checks the file, decoder checks audio")
        job["referenceAudio"] = str(ref)
        self.assertEqual(validate_job(job, self.output), job)
        job["referenceText"] = ""
        with self.assertRaisesRegex(ValueError, "transcript"):
            validate_job(job, self.output)

    def test_existing_output_or_manifest_is_preserved(self):
        job = {"mode": "preset", "text": "안녕하세요"}
        self.output.with_suffix(".json").write_text("existing")
        with self.assertRaises(FileExistsError):
            validate_job(job, self.output)
        self.assertEqual(self.output.with_suffix(".json").read_text(), "existing")

    def test_empty_or_unbounded_script_is_rejected(self):
        for text in ("", " ", "가" * 2001):
            with self.assertRaises(ValueError):
                validate_job({"mode": "preset", "text": text}, self.output)


if __name__ == "__main__":
    unittest.main()
