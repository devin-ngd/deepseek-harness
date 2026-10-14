/* eslint-disable @stylistic/quotes, @stylistic/comma-dangle -- Generated JSON preserves shared-source schema spelling. */
/** Generated from the shared safe-external-research source; run scripts/sync-contract.mjs. @module research-contract */

/** Exact trusted-source digests for result v1. */
export const skillHashes = {
  "SKILL.md": "ccfc4d41aed31029ceabf7f99e0c796689b3c8e21c987dfae58a0a6938f9383d",
  "references/dsh.md": "42df644cb1d628eceaab5c056ea375015f598501b9656b646444f342b028768b",
  "references/result-contract.md": "5e2add2b32211a6930a71ed417115be7c281a5533e12f358de02656105291b15",
  "references/result.schema.json": "e8f3dcc85433dc0a48884c8dae7c0d24f10295d4c79945e5edaa9adcf0fbaefd"
} as const

/** Shared result v1 JSON Schema, validated by Ajv 2020. */
export const resultSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Safe external research result v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "status",
    "summary",
    "sources",
    "findings",
    "risk_flags",
    "limitations"
  ],
  "properties": {
    "schema_version": {
      "const": 1
    },
    "status": {
      "enum": [
        "ok",
        "partial",
        "blocked"
      ]
    },
    "summary": {
      "type": "string",
      "maxLength": 1600
    },
    "sources": {
      "type": "array",
      "maxItems": 12,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "url",
          "locator"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^s[1-9][0-9]*$",
            "maxLength": 8
          },
          "url": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2048
          },
          "locator": {
            "type": "string",
            "maxLength": 240
          }
        }
      }
    },
    "findings": {
      "type": "array",
      "maxItems": 16,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "statement",
          "kind",
          "source_ids"
        ],
        "properties": {
          "statement": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1600
          },
          "kind": {
            "enum": [
              "fact",
              "inference"
            ]
          },
          "source_ids": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "pattern": "^s[1-9][0-9]*$",
              "maxLength": 8
            }
          }
        }
      }
    },
    "risk_flags": {
      "type": "array",
      "maxItems": 8,
      "uniqueItems": true,
      "items": {
        "enum": [
          "instruction_override",
          "private_data_request",
          "unauthorized_egress",
          "code_execution_request",
          "permission_change",
          "source_mismatch",
          "active_content",
          "other"
        ]
      }
    },
    "limitations": {
      "type": "array",
      "maxItems": 8,
      "items": {
        "type": "string",
        "maxLength": 400
      }
    }
  }
} as const
