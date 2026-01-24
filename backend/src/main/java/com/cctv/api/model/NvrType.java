package com.cctv.api.model;

public enum NvrType {
    HIKVISION,
    CP_PLUS,
    ADIVA;

    public static NvrType fromString(String type) {
        if (type == null)
            return null;
        String normalized = type.toLowerCase().replace(" ", "");
        if (normalized.contains("hikvision"))
            return HIKVISION;
        if (normalized.contains("cpplus"))
            return CP_PLUS;
        if (normalized.contains("adiva"))
            return ADIVA;
        return null;
    }
}
